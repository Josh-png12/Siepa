-- CreateEnum
CREATE TYPE "Role" AS ENUM ('estudiante', 'docente', 'admin', 'padre');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CC', 'TI', 'CE', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "QuestionVisibility" AS ENUM ('private', 'institutional', 'national');

-- CreateEnum
CREATE TYPE "CalibrationStatus" AS ENUM ('experimental', 'calibrated');

-- CreateEnum
CREATE TYPE "QuestionState" AS ENUM ('borrador', 'publicada');

-- CreateEnum
CREATE TYPE "NivelCognitivo" AS ENUM ('recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear');

-- CreateEnum
CREATE TYPE "DificultadCualitativa" AS ENUM ('baja', 'media', 'alta');

-- CreateEnum
CREATE TYPE "SimulacroState" AS ENUM ('borrador', 'publicado', 'cerrado');

-- CreateEnum
CREATE TYPE "SimulacroResultStatus" AS ENUM ('in_progress', 'submitted');

-- CreateEnum
CREATE TYPE "PhysicalSimulacroStatus" AS ENUM ('draft', 'answerKeyPending', 'readyForUpload', 'processing', 'reviewing', 'published', 'archived');

-- CreateEnum
CREATE TYPE "PhysicalAnswerSheetStatus" AS ENUM ('valid', 'needsReview', 'invalid', 'duplicate');

-- CreateEnum
CREATE TYPE "PhysicalSheetStatus" AS ENUM ('uploaded', 'processing', 'processed', 'needs_review', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('virtual', 'physical');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('in_progress', 'completed', 'paused');

-- CreateEnum
CREATE TYPE "PdfImportJobStatus" AS ENUM ('draft', 'uploaded', 'extracting', 'parsing', 'previewReady', 'confirmed', 'failed');

-- CreateEnum
CREATE TYPE "PdfImportBatchStatus" AS ENUM ('preview', 'imported', 'failed');

-- CreateEnum
CREATE TYPE "QuestionChangeType" AS ENUM ('create', 'update', 'publish', 'restore', 'import');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "deletedAt" TIMESTAMP(3),
    "documentType" "DocumentType",
    "documentNumber" TEXT,
    "grade" TEXT,
    "currentTheta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featurePhysicalSimulacros" BOOLEAN NOT NULL DEFAULT false,
    "featureOcrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grade" TEXT NOT NULL DEFAULT '11',
    "identificationType" TEXT,
    "identificationNumber" TEXT,
    "phone" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentStudent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "averageTheta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CourseStatus" NOT NULL DEFAULT 'active',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseGroup" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contextText" TEXT,
    "contextLatex" TEXT,
    "contextImages" JSONB,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "statementText" TEXT,
    "statementImages" JSONB,
    "latex" TEXT,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "nivelCognitivo" "NivelCognitivo" NOT NULL,
    "dificultadCualitativa" "DificultadCualitativa" NOT NULL,
    "triParamA" DOUBLE PRECISION,
    "triParamB" DOUBLE PRECISION,
    "triParamC" DOUBLE PRECISION,
    "visibility" "QuestionVisibility" NOT NULL DEFAULT 'private',
    "calibrationStatus" "CalibrationStatus" NOT NULL DEFAULT 'experimental',
    "estado" "QuestionState" NOT NULL DEFAULT 'borrador',
    "statsTimesUsed" INTEGER NOT NULL DEFAULT 0,
    "statsCorrectRate" DOUBLE PRECISION,
    "statsDiscriminationIndex" DOUBLE PRECISION,
    "statsAvgThetaWrong" DOUBLE PRECISION,
    "caseGroupId" TEXT,
    "importBatchId" TEXT,
    "sourceType" TEXT,
    "sourcePdfId" TEXT,
    "sourceSessionName" TEXT,
    "sourcePageStart" INTEGER,
    "sourcePageEnd" INTEGER,
    "sourceBlockLabel" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVersion" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeType" "QuestionChangeType" NOT NULL,
    "changeReason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulacro" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "globalTimeLimit" INTEGER,
    "strictMode" BOOLEAN NOT NULL DEFAULT false,
    "estado" "SimulacroState" NOT NULL DEFAULT 'borrador',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "fechaPublicacion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulacroModule" (
    "id" TEXT NOT NULL,
    "simulacroId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeLimit" INTEGER,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SimulacroModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulacroQuestion" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "questionId" TEXT,
    "embeddedQuestion" JSONB,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SimulacroQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulacroResult" (
    "id" TEXT NOT NULL,
    "simulacroId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "overallTheta" DOUBLE PRECISION,
    "percentile" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "status" "SimulacroResultStatus" NOT NULL DEFAULT 'in_progress',
    "markedForReview" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulacroResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulacroAnswer" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "simulacroQuestionId" TEXT NOT NULL,
    "selectedOption" TEXT,
    "isCorrect" BOOLEAN,

    CONSTRAINT "SimulacroAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulacroModuleTime" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "secondsSpent" INTEGER NOT NULL,

    CONSTRAINT "SimulacroModuleTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulacroModuleTheta" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SimulacroModuleTheta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "currentTheta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentile" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "simulacrosCompletados" INTEGER NOT NULL DEFAULT 0,
    "rachaActual" INTEGER NOT NULL DEFAULT 0,
    "ultimoSimulacro" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCompetency" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThetaHistory" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL,
    "globalScore" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThetaHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAlert" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StudentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMaterial" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "area" TEXT,
    "competencia" TEXT,
    "thetaTarget" DOUBLE PRECISION,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialAccess" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalSimulacro" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "teacherId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "status" "PhysicalSimulacroStatus" NOT NULL DEFAULT 'draft',
    "totalQuestions" INTEGER NOT NULL,
    "reviewDeadline" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalSimulacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalAnswerKey" (
    "id" TEXT NOT NULL,
    "physicalSimulacroId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "correctOption" TEXT NOT NULL,
    "questionId" TEXT,

    CONSTRAINT "PhysicalAnswerKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalAnswerSheet" (
    "id" TEXT NOT NULL,
    "physicalSimulacroId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "rawFilePath" TEXT NOT NULL,
    "parsedAnswers" JSONB,
    "score" DOUBLE PRECISION,
    "theta" DOUBLE PRECISION,
    "status" "PhysicalAnswerSheetStatus" NOT NULL DEFAULT 'needsReview',
    "errors" JSONB,
    "manualCorrections" JSONB,
    "detectionConfidence" DOUBLE PRECISION,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalAnswerSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalSheet" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "simulacroId" TEXT NOT NULL,
    "originalName" TEXT,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "rawResponses" TEXT[],
    "confirmedResponses" TEXT[],
    "ocrConfidence" DOUBLE PRECISION,
    "ocrErrors" TEXT[],
    "status" "PhysicalSheetStatus" NOT NULL DEFAULT 'uploaded',
    "triTheta" DOUBLE PRECISION,
    "triScaledScore" DOUBLE PRECISION,
    "triPercentil" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "pdfBasePath" TEXT NOT NULL,
    "coordinateJSON" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booklet" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booklet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookletQuestion" (
    "id" TEXT NOT NULL,
    "bookletId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "BookletQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "bookletId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" TEXT,

    CONSTRAINT "ResponseAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "recomendaciones" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCompetency" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "fortalezas" TEXT[],
    "debilidades" TEXT[],

    CONSTRAINT "ReportCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bookletId" TEXT,
    "physicalSimulacroId" TEXT,
    "evaluationType" "EvaluationType" NOT NULL,
    "theta" DOUBLE PRECISION,
    "globalScore" DOUBLE PRECISION,
    "percentile" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "physicalRawScore" DOUBLE PRECISION,
    "physicalPercentCorrect" DOUBLE PRECISION,
    "physicalCompetencyBreakdown" JSONB,
    "physicalScannedSheetPath" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResponse" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" TEXT,
    "status" TEXT,
    "correctAnswer" TEXT,
    "isCorrect" BOOLEAN,

    CONSTRAINT "EvaluationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfImportJob" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceFilePath" TEXT,
    "sourceOriginalName" TEXT,
    "sourceMimeType" TEXT,
    "sourceSize" INTEGER,
    "status" "PdfImportJobStatus" NOT NULL DEFAULT 'draft',
    "pages" INTEGER,
    "isScanned" BOOLEAN NOT NULL DEFAULT false,
    "ocrEngine" TEXT,
    "extractedTextPath" TEXT,
    "parsedJsonPath" TEXT,
    "previewQuestions" JSONB,
    "previewWarnings" JSONB,
    "previewStats" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfImportAsset" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfImportAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfImportBatch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sessionName" TEXT,
    "grade" TEXT,
    "year" TEXT,
    "questionsPdfPath" TEXT,
    "answersPdfPath" TEXT,
    "status" "PdfImportBatchStatus" NOT NULL DEFAULT 'preview',
    "detectedBlocks" JSONB,
    "detectedQuestions" JSONB,
    "pages" JSONB,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB,
    "warnings" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "courseId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionMetrics" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "InstitutionMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "maxUploadMB" INTEGER NOT NULL DEFAULT 25,
    "ocrReviewWindowDays" INTEGER NOT NULL DEFAULT 14,
    "fileRetentionDays" INTEGER NOT NULL DEFAULT 14,
    "triMinTheta" DOUBLE PRECISION NOT NULL DEFAULT -4,
    "triMaxTheta" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "triDefaultC" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "featurePhysicalGlobal" BOOLEAN NOT NULL DEFAULT false,
    "featureOcrGlobal" BOOLEAN NOT NULL DEFAULT true,
    "featureModeration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CourseToPhysicalSimulacro" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");

-- CreateIndex
CREATE INDEX "User_schoolId_role_status_idx" ON "User"("schoolId", "role", "status");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_schoolId_key" ON "User"("email", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Student_grade_idx" ON "Student"("grade");

-- CreateIndex
CREATE INDEX "ParentStudent_parentId_idx" ON "ParentStudent"("parentId");

-- CreateIndex
CREATE INDEX "ParentStudent_studentId_idx" ON "ParentStudent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentStudent_parentId_studentId_key" ON "ParentStudent"("parentId", "studentId");

-- CreateIndex
CREATE INDEX "Course_schoolId_status_grade_idx" ON "Course"("schoolId", "status", "grade");

-- CreateIndex
CREATE INDEX "Course_teacherId_idx" ON "Course"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_schoolId_teacherId_name_key" ON "Course"("schoolId", "teacherId", "name");

-- CreateIndex
CREATE INDEX "CourseEnrollment_courseId_idx" ON "CourseEnrollment"("courseId");

-- CreateIndex
CREATE INDEX "CourseEnrollment_studentId_idx" ON "CourseEnrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_courseId_studentId_key" ON "CourseEnrollment"("courseId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_teacherId_courseId_key" ON "TeacherAssignment"("teacherId", "courseId");

-- CreateIndex
CREATE INDEX "Question_schoolId_area_competencia_dificultadCualitativa_idx" ON "Question"("schoolId", "area", "competencia", "dificultadCualitativa");

-- CreateIndex
CREATE INDEX "Question_schoolId_area_competencia_createdAt_idx" ON "Question"("schoolId", "area", "competencia", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Question_createdById_visibility_calibrationStatus_idx" ON "Question"("createdById", "visibility", "calibrationStatus");

-- CreateIndex
CREATE INDEX "Question_updatedAt_idx" ON "Question"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Question_caseGroupId_idx" ON "Question"("caseGroupId");

-- CreateIndex
CREATE INDEX "Question_importBatchId_idx" ON "Question"("importBatchId");

-- CreateIndex
CREATE INDEX "QuestionVersion_questionId_idx" ON "QuestionVersion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVersion_questionId_versionNumber_key" ON "QuestionVersion"("questionId", "versionNumber");

-- CreateIndex
CREATE INDEX "Simulacro_schoolId_createdById_estado_idx" ON "Simulacro"("schoolId", "createdById", "estado");

-- CreateIndex
CREATE INDEX "Simulacro_fechaPublicacion_idx" ON "Simulacro"("fechaPublicacion");

-- CreateIndex
CREATE INDEX "SimulacroModule_simulacroId_idx" ON "SimulacroModule"("simulacroId");

-- CreateIndex
CREATE INDEX "SimulacroQuestion_moduleId_idx" ON "SimulacroQuestion"("moduleId");

-- CreateIndex
CREATE INDEX "SimulacroQuestion_questionId_idx" ON "SimulacroQuestion"("questionId");

-- CreateIndex
CREATE INDEX "SimulacroResult_simulacroId_studentId_createdAt_idx" ON "SimulacroResult"("simulacroId", "studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SimulacroResult_schoolId_studentId_idx" ON "SimulacroResult"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "SimulacroResult_status_idx" ON "SimulacroResult"("status");

-- CreateIndex
CREATE INDEX "SimulacroAnswer_resultId_idx" ON "SimulacroAnswer"("resultId");

-- CreateIndex
CREATE INDEX "SimulacroAnswer_simulacroQuestionId_idx" ON "SimulacroAnswer"("simulacroQuestionId");

-- CreateIndex
CREATE INDEX "SimulacroModuleTime_resultId_idx" ON "SimulacroModuleTime"("resultId");

-- CreateIndex
CREATE INDEX "SimulacroModuleTheta_resultId_idx" ON "SimulacroModuleTheta"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProgress_studentId_key" ON "StudentProgress"("studentId");

-- CreateIndex
CREATE INDEX "StudentProgress_schoolId_currentTheta_idx" ON "StudentProgress"("schoolId", "currentTheta" DESC);

-- CreateIndex
CREATE INDEX "StudentProgress_schoolId_simulacrosCompletados_idx" ON "StudentProgress"("schoolId", "simulacrosCompletados" DESC);

-- CreateIndex
CREATE INDEX "StudentCompetency_progressId_idx" ON "StudentCompetency"("progressId");

-- CreateIndex
CREATE INDEX "StudentCompetency_area_theta_idx" ON "StudentCompetency"("area", "theta" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StudentCompetency_progressId_area_key" ON "StudentCompetency"("progressId", "area");

-- CreateIndex
CREATE INDEX "ThetaHistory_progressId_recordedAt_idx" ON "ThetaHistory"("progressId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "StudentAlert_progressId_leida_idx" ON "StudentAlert"("progressId", "leida");

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_createdAt_idx" ON "CourseMaterial"("courseId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_area_competencia_idx" ON "CourseMaterial"("courseId", "area", "competencia");

-- CreateIndex
CREATE INDEX "MaterialAccess_materialId_studentId_openedAt_idx" ON "MaterialAccess"("materialId", "studentId", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "MaterialAccess_studentId_idx" ON "MaterialAccess"("studentId");

-- CreateIndex
CREATE INDEX "PhysicalSimulacro_schoolId_teacherId_status_idx" ON "PhysicalSimulacro"("schoolId", "teacherId", "status");

-- CreateIndex
CREATE INDEX "PhysicalSimulacro_date_idx" ON "PhysicalSimulacro"("date" DESC);

-- CreateIndex
CREATE INDEX "PhysicalSimulacro_status_createdAt_idx" ON "PhysicalSimulacro"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PhysicalAnswerKey_physicalSimulacroId_idx" ON "PhysicalAnswerKey"("physicalSimulacroId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalAnswerKey_physicalSimulacroId_questionNumber_key" ON "PhysicalAnswerKey"("physicalSimulacroId", "questionNumber");

-- CreateIndex
CREATE INDEX "PhysicalAnswerSheet_physicalSimulacroId_idx" ON "PhysicalAnswerSheet"("physicalSimulacroId");

-- CreateIndex
CREATE INDEX "PhysicalAnswerSheet_studentId_idx" ON "PhysicalAnswerSheet"("studentId");

-- CreateIndex
CREATE INDEX "PhysicalAnswerSheet_status_idx" ON "PhysicalAnswerSheet"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalAnswerSheet_physicalSimulacroId_qrToken_key" ON "PhysicalAnswerSheet"("physicalSimulacroId", "qrToken");

-- CreateIndex
CREATE INDEX "PhysicalSheet_courseId_status_idx" ON "PhysicalSheet"("courseId", "status");

-- CreateIndex
CREATE INDEX "PhysicalSheet_createdById_createdAt_idx" ON "PhysicalSheet"("createdById", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalSheet_studentId_simulacroId_key" ON "PhysicalSheet"("studentId", "simulacroId");

-- CreateIndex
CREATE INDEX "PhysicalTemplate_schoolId_isActive_createdAt_idx" ON "PhysicalTemplate"("schoolId", "isActive", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BookletQuestion_bookletId_idx" ON "BookletQuestion"("bookletId");

-- CreateIndex
CREATE UNIQUE INDEX "BookletQuestion_bookletId_questionId_key" ON "BookletQuestion"("bookletId", "questionId");

-- CreateIndex
CREATE INDEX "Response_bookletId_idx" ON "Response"("bookletId");

-- CreateIndex
CREATE INDEX "Response_studentId_idx" ON "Response"("studentId");

-- CreateIndex
CREATE INDEX "ResponseAnswer_responseId_idx" ON "ResponseAnswer"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_responseId_key" ON "Report"("responseId");

-- CreateIndex
CREATE INDEX "ReportCompetency_reportId_idx" ON "ReportCompetency"("reportId");

-- CreateIndex
CREATE INDEX "Evaluation_studentId_idx" ON "Evaluation"("studentId");

-- CreateIndex
CREATE INDEX "Evaluation_evaluationType_idx" ON "Evaluation"("evaluationType");

-- CreateIndex
CREATE INDEX "Evaluation_status_idx" ON "Evaluation"("status");

-- CreateIndex
CREATE INDEX "EvaluationResponse_evaluationId_idx" ON "EvaluationResponse"("evaluationId");

-- CreateIndex
CREATE INDEX "PdfImportJob_schoolId_createdById_status_idx" ON "PdfImportJob"("schoolId", "createdById", "status");

-- CreateIndex
CREATE INDEX "PdfImportJob_createdAt_idx" ON "PdfImportJob"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdfImportAsset_jobId_idx" ON "PdfImportAsset"("jobId");

-- CreateIndex
CREATE INDEX "PdfImportAsset_schoolId_idx" ON "PdfImportAsset"("schoolId");

-- CreateIndex
CREATE INDEX "PdfImportBatch_schoolId_createdById_createdAt_idx" ON "PdfImportBatch"("schoolId", "createdById", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_userId_timestamp_idx" ON "AuditLog"("schoolId", "userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_timestamp_idx" ON "AuditLog"("entityType", "entityId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "InstitutionMetrics_schoolId_date_idx" ON "InstitutionMetrics"("schoolId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionMetrics_schoolId_date_key" ON "InstitutionMetrics"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_schoolId_key" ON "SystemConfig"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "_CourseToPhysicalSimulacro_AB_unique" ON "_CourseToPhysicalSimulacro"("A", "B");

-- CreateIndex
CREATE INDEX "_CourseToPhysicalSimulacro_B_index" ON "_CourseToPhysicalSimulacro"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseGroup" ADD CONSTRAINT "CaseGroup_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_caseGroupId_fkey" FOREIGN KEY ("caseGroupId") REFERENCES "CaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "PdfImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVersion" ADD CONSTRAINT "QuestionVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulacro" ADD CONSTRAINT "Simulacro_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulacro" ADD CONSTRAINT "Simulacro_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulacro" ADD CONSTRAINT "Simulacro_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroModule" ADD CONSTRAINT "SimulacroModule_simulacroId_fkey" FOREIGN KEY ("simulacroId") REFERENCES "Simulacro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroQuestion" ADD CONSTRAINT "SimulacroQuestion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "SimulacroModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroQuestion" ADD CONSTRAINT "SimulacroQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroResult" ADD CONSTRAINT "SimulacroResult_simulacroId_fkey" FOREIGN KEY ("simulacroId") REFERENCES "Simulacro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroResult" ADD CONSTRAINT "SimulacroResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroAnswer" ADD CONSTRAINT "SimulacroAnswer_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "SimulacroResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroAnswer" ADD CONSTRAINT "SimulacroAnswer_simulacroQuestionId_fkey" FOREIGN KEY ("simulacroQuestionId") REFERENCES "SimulacroQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroModuleTime" ADD CONSTRAINT "SimulacroModuleTime_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "SimulacroResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulacroModuleTheta" ADD CONSTRAINT "SimulacroModuleTheta_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "SimulacroResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgress" ADD CONSTRAINT "StudentProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCompetency" ADD CONSTRAINT "StudentCompetency_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "StudentProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThetaHistory" ADD CONSTRAINT "ThetaHistory_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "StudentProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAlert" ADD CONSTRAINT "StudentAlert_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "StudentProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAccess" ADD CONSTRAINT "MaterialAccess_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CourseMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAccess" ADD CONSTRAINT "MaterialAccess_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSimulacro" ADD CONSTRAINT "PhysicalSimulacro_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSimulacro" ADD CONSTRAINT "PhysicalSimulacro_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalAnswerKey" ADD CONSTRAINT "PhysicalAnswerKey_physicalSimulacroId_fkey" FOREIGN KEY ("physicalSimulacroId") REFERENCES "PhysicalSimulacro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalAnswerKey" ADD CONSTRAINT "PhysicalAnswerKey_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalAnswerSheet" ADD CONSTRAINT "PhysicalAnswerSheet_physicalSimulacroId_fkey" FOREIGN KEY ("physicalSimulacroId") REFERENCES "PhysicalSimulacro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalAnswerSheet" ADD CONSTRAINT "PhysicalAnswerSheet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSheet" ADD CONSTRAINT "PhysicalSheet_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSheet" ADD CONSTRAINT "PhysicalSheet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSheet" ADD CONSTRAINT "PhysicalSheet_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSheet" ADD CONSTRAINT "PhysicalSheet_simulacroId_fkey" FOREIGN KEY ("simulacroId") REFERENCES "Simulacro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSheet" ADD CONSTRAINT "PhysicalSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalSheet" ADD CONSTRAINT "PhysicalSheet_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalTemplate" ADD CONSTRAINT "PhysicalTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalTemplate" ADD CONSTRAINT "PhysicalTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booklet" ADD CONSTRAINT "Booklet_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booklet" ADD CONSTRAINT "Booklet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookletQuestion" ADD CONSTRAINT "BookletQuestion_bookletId_fkey" FOREIGN KEY ("bookletId") REFERENCES "Booklet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookletQuestion" ADD CONSTRAINT "BookletQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_bookletId_fkey" FOREIGN KEY ("bookletId") REFERENCES "Booklet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseAnswer" ADD CONSTRAINT "ResponseAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCompetency" ADD CONSTRAINT "ReportCompetency_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_bookletId_fkey" FOREIGN KEY ("bookletId") REFERENCES "Booklet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_physicalSimulacroId_fkey" FOREIGN KEY ("physicalSimulacroId") REFERENCES "PhysicalSimulacro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResponse" ADD CONSTRAINT "EvaluationResponse_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfImportJob" ADD CONSTRAINT "PdfImportJob_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfImportJob" ADD CONSTRAINT "PdfImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfImportAsset" ADD CONSTRAINT "PdfImportAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PdfImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfImportBatch" ADD CONSTRAINT "PdfImportBatch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfImportBatch" ADD CONSTRAINT "PdfImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionMetrics" ADD CONSTRAINT "InstitutionMetrics_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToPhysicalSimulacro" ADD CONSTRAINT "_CourseToPhysicalSimulacro_A_fkey" FOREIGN KEY ("A") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseToPhysicalSimulacro" ADD CONSTRAINT "_CourseToPhysicalSimulacro_B_fkey" FOREIGN KEY ("B") REFERENCES "PhysicalSimulacro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
