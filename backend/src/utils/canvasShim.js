// pdfjs-dist v2 hardcodes require('canvas') at load time.
// canvas.node is not compiled on this system, but @napi-rs/canvas provides
// a compatible API with prebuilt binaries. Inject it into require.cache before
// pdfjs loads so it gets @napi-rs/canvas transparently.
try {
  const napiCanvas = require('@napi-rs/canvas');
  const canvasPath = require.resolve('canvas');
  if (!require.cache[canvasPath]) {
    require.cache[canvasPath] = {
      id: canvasPath,
      filename: canvasPath,
      loaded: true,
      exports: napiCanvas,
      parent: null,
      children: []
    };
  }
} catch (_) {}
