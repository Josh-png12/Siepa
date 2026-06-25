const ApiError = require('../utils/ApiError');

class OcrProcessingQueue {
  constructor({ concurrency = 2 } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.running = 0;
    this.queue = [];
  }

  enqueue(job) {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.processNext();
    });
  }

  processNext() {
    if (this.running >= this.concurrency) return;
    const item = this.queue.shift();
    if (!item) return;

    this.running += 1;

    Promise.resolve()
      .then(() => item.job())
      .then((result) => item.resolve(result))
      .catch((error) => {
        console.error('[OCR QUEUE ERROR]', error instanceof Error ? error.message : error);
        if (error instanceof Error) console.error(error.stack);
        item.reject(error instanceof Error ? error : new ApiError(500, 'OCR job failed'));
      })
      .finally(() => {
        this.running -= 1;
        this.processNext();
      });
  }
}

module.exports = new OcrProcessingQueue({ concurrency: 2 });
