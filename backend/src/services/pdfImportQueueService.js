const ApiError = require('../utils/ApiError');

class PdfImportQueueService {
  constructor({ concurrency = 1 } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.running = 0;
    this.queue = [];
    this.processor = null;
  }

  setProcessor(processor) {
    this.processor = processor;
  }

  enqueue(jobId) {
    return new Promise((resolve, reject) => {
      this.queue.push({ jobId, resolve, reject });
      this.processNext();
    });
  }

  processNext() {
    if (this.running >= this.concurrency) return;
    if (!this.processor) return;

    const nextItem = this.queue.shift();
    if (!nextItem) return;

    this.running += 1;
    Promise.resolve()
      .then(() => this.processor(nextItem.jobId))
      .then((result) => nextItem.resolve(result))
      .catch((error) => {
        nextItem.reject(error instanceof Error ? error : new ApiError(500, 'Pdf import worker failed'));
      })
      .finally(() => {
        this.running -= 1;
        this.processNext();
      });
  }
}

module.exports = new PdfImportQueueService({
  concurrency: Number(process.env.PDF_IMPORT_CONCURRENCY || 1)
});
