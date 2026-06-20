import json
import math
import os
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Query, UploadFile, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI(title="SIEPA OMR Service", version="1.0.0")

# omrCoordinates.json lives at ../backend/src/config/ relative to this file
OMR_COORDS_PATH = Path(__file__).parent.parent / "backend" / "src" / "config" / "omrCoordinates.json"
DEFAULT_DPI = int(os.environ.get("OMR_DPI", 200))
DARK_THRESHOLD = int(os.environ.get("OMR_DARK_THRESHOLD", 128))
MIN_COVERAGE = 0.5


def load_omr_coords() -> dict:
    with open(OMR_COORDS_PATH) as f:
        return json.load(f)


def mm_to_px(mm: float, dpi: int) -> float:
    return mm * dpi / 25.4


def compute_bubble_center(question_number: int, option_index: int, dpi: int, coords: dict):
    grid_origin = coords["gridOrigin"]
    bubble = coords["bubble"]
    questions_per_col = coords["questionsPerColumn"]
    column_spacing = coords["columnSpacing"]

    col = (question_number - 1) // questions_per_col
    row = (question_number - 1) % questions_per_col
    base_x = grid_origin["x"] + col * column_spacing
    cx = mm_to_px(base_x + option_index * bubble["spacingX"], dpi)
    cy = mm_to_px(grid_origin["y"] + row * bubble["spacingY"], dpi)
    return round(cx), round(cy)


def sample_circle_density(gray: np.ndarray, cx: int, cy: int, radius_px: float) -> float:
    """
    Counts dark pixels (value < DARK_THRESHOLD) in a circle of radius_px around (cx, cy).
    Matches the JS sampleCircleDensity logic exactly.
    """
    h, w = gray.shape
    r = math.ceil(radius_px)
    r2 = radius_px * radius_px
    dark = 0
    total = 0

    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r2:
                continue
            px_x, px_y = cx + dx, cy + dy
            if px_x < 0 or px_x >= w or px_y < 0 or px_y >= h:
                continue
            total += 1
            if int(gray[px_y, px_x]) < DARK_THRESHOLD:
                dark += 1

    if total == 0:
        return 0.0
    expected = math.pi * radius_px * radius_px
    if total / expected < MIN_COVERAGE:
        return 0.0
    return dark / total


def order_points(pts: np.ndarray) -> np.ndarray:
    """Orders 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left has smallest sum
    rect[2] = pts[np.argmax(s)]   # bottom-right has largest sum
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right has smallest x-y diff
    rect[3] = pts[np.argmax(diff)]  # bottom-left has largest x-y diff
    return rect


def find_and_correct_perspective(gray: np.ndarray) -> tuple:
    """
    Detects the answer sheet boundary (largest 4-sided contour) and applies
    perspective correction via getPerspectiveTransform + warpPerspective.
    Returns (corrected_gray, was_corrected).
    """
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    # Invert for contour finding: sheet border appears as bright ring on dark bg
    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11, 2
    )

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return gray, False

    img_area = gray.shape[0] * gray.shape[1]
    contours_sorted = sorted(contours, key=cv2.contourArea, reverse=True)
    sheet_contour = None

    for cnt in contours_sorted[:5]:
        perimeter = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * perimeter, True)
        if len(approx) == 4:
            area = cv2.contourArea(approx)
            # Must cover at least 20% of the image to be the sheet
            if area > img_area * 0.20:
                sheet_contour = approx
                break

    if sheet_contour is None:
        return gray, False

    h, w = gray.shape
    pts = sheet_contour.reshape(4, 2).astype(np.float32)
    src_pts = order_points(pts)
    dst_pts = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)

    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(gray, M, (w, h))
    return warped, True


def read_qr(gray: np.ndarray, coords: dict, dpi: int) -> Optional[str]:
    """
    Tries pyzbar then zxing-cpp to decode a QR from the image.
    Falls back to cropping the QR region defined in omrCoordinates.json.
    """
    def _try_decode(img_arr: np.ndarray) -> Optional[str]:
        try:
            from pyzbar.pyzbar import decode as pyzbar_decode
            results = pyzbar_decode(img_arr)
            if results:
                return results[0].data.decode("utf-8")
        except (ImportError, Exception):
            pass
        try:
            import zxingcpp
            result = zxingcpp.read_barcode(img_arr)
            if result and result.text:
                return result.text
        except (ImportError, Exception):
            pass
        return None

    # Try full image first
    token = _try_decode(gray)
    if token:
        return token

    # Crop to the QR region from coordinates
    qr = coords.get("qr", {})
    if not qr:
        return None

    pad_mm = 5
    qx = int(mm_to_px(qr["x"], dpi))
    qy = int(mm_to_px(qr["y"], dpi))
    qsize = int(mm_to_px(qr["size"], dpi))
    pad = int(mm_to_px(pad_mm, dpi))
    x1 = max(0, qx - pad)
    y1 = max(0, qy - pad)
    x2 = min(gray.shape[1], qx + qsize + pad)
    y2 = min(gray.shape[0], qy + qsize + pad)

    if x2 > x1 and y2 > y1:
        crop = gray[y1:y2, x1:x2]
        return _try_decode(crop)

    return None


@app.get("/health")
def health():
    return {"status": "ok", "service": "SIEPA OMR"}


@app.post("/process-sheet")
async def process_sheet(
    file: UploadFile = File(...),
    dpi: int = Query(default=DEFAULT_DPI, description="Image DPI (default 200)")
):
    data = await file.read()
    nparr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image — must be PNG or JPG")

    try:
        coords = load_omr_coords()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"omrCoordinates.json not found at {OMR_COORDS_PATH}")

    # Step 1: Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Step 2–3: Adaptive binarization + perspective correction
    corrected, was_corrected = find_and_correct_perspective(gray)

    # Step 4–5: Compute bubble positions in pixels and sample dark-pixel density
    n_opts = coords.get("numOptions", 5)
    n_questions = coords["columns"] * coords["questionsPerColumn"]
    radius_px = mm_to_px(coords["bubble"]["diameter"] / 2, dpi)

    bubble_matrix = []
    max_densities = []

    for q in range(1, n_questions + 1):
        options_density = []
        for i in range(n_opts):
            cx, cy = compute_bubble_center(q, i, dpi, coords)
            density = sample_circle_density(corrected, cx, cy, radius_px)
            options_density.append(round(density, 4))
        bubble_matrix.append({
            "questionNumber": q,
            "optionsDensity": options_density
        })
        max_densities.append(max(options_density))

    confidence = round(sum(max_densities) / len(max_densities), 4) if max_densities else 0.0

    # Step 6: Read QR code
    qr_token = read_qr(corrected, coords, dpi)

    return JSONResponse({
        "bubbleMatrix": bubble_matrix,
        "qrToken": qr_token,
        "corrected": was_corrected,
        "confidence": confidence
    })
