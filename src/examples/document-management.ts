/**
 * Document Management Example
 *
 * Demonstrates how to upload, search, and manage documents with OCR + RAG.
 */

import { GovernsAIClient } from '../index';
import { promises as fs } from 'fs';

const client = new GovernsAIClient({
  apiKey: process.env.GOVERNS_API_KEY || 'your-api-key',
  baseUrl: process.env.GOVERNS_BASE_URL || 'https://api.governsai.com',
  orgId: process.env.GOVERNS_ORG_ID || 'org-123',
});

async function uploadDocumentSync() {
  const buffer = await fs.readFile('./sample-docs/invoice.pdf');

  const upload = await client.documents.uploadDocument({
    externalUserId: 'customer-001',
    externalSource: 'billing-portal',
    file: buffer,
    filename: 'invoice.pdf',
    metadata: {
      invoiceId: 'inv-1001',
      source: 'billing-portal',
    },
  });

  console.log('Uploaded document:', upload.documentId, upload.status);
  return upload.documentId;
}

async function uploadDocumentAsync() {
  const buffer = await fs.readFile('./sample-docs/receipt.pdf');

  const upload = await client.documents.uploadDocument({
    externalUserId: 'customer-002',
    externalSource: 'billing-portal',
    file: buffer,
    filename: 'receipt.pdf',
    processingMode: 'async',
  });

  console.log('Queued document:', upload.documentId, upload.status);
  return upload.documentId;
}

async function searchDocuments(externalUserId: string) {
  const results = await client.documents.searchDocuments({
    externalUserId,
    externalSource: 'billing-portal',
    query: 'refund policy',
    limit: 5,
  });

  console.log('Search results:', results.results.length);
  results.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.document.filename} (score: ${result.similarity.toFixed(2)})`);
  });
}

async function getDocumentDetails(documentId: string) {
  const document = await client.documents.getDocument(documentId, {
    includeChunks: true,
  });

  console.log('Document:', document.filename, document.status, document.chunkCount);
}

async function listDocuments() {
  const list = await client.documents.listDocuments({
    externalUserId: 'customer-001',
    externalSource: 'billing-portal',
    limit: 10,
  });

  console.log('Documents:', list.documents.length);
}

async function deleteDocument(documentId: string) {
  const result = await client.documents.deleteDocument(documentId);
  console.log('Deleted:', result.deleted);
}

async function run() {
  const documentId = await uploadDocumentSync();
  await uploadDocumentAsync();
  await getDocumentDetails(documentId);
  await searchDocuments('customer-001');
  await listDocuments();
  await deleteDocument(documentId);
}

run().catch((error) => {
  console.error('Document example failed:', error);
});
