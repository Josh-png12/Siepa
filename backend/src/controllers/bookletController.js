const asyncHandler = require('express-async-handler');
const { createBooklet, getBooklet } = require('../services/questionService');

const create = asyncHandler(async (req, res) => {
  const { title, questions, duration } = req.body;
  const booklet = await createBooklet(title, questions, req.user.id, duration);
  res.status(201).json(booklet);
});

const get = asyncHandler(async (req, res) => {
  const booklet = await getBooklet(req.params.id);
  res.json(booklet);
}); 

const generatePDFEndpoint = asyncHandler(async (req, res) => {
  const booklet = await getBooklet(req.params.id);
  const pdfBuffer = generatePDF(booklet);
  res.setHeader('Content-Type', 'application/pdf');
  res.send(Buffer.from(pdfBuffer));
}); 
module.exports = { create, get };