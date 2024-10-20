import Fastify from 'fastify';
import fastifyWs from '@fastify/websocket';
import { config } from './config';
import cors from '@fastify/cors';
import { DefaultAzureCredential } from '@azure/identity';
import { AzureKeyCredential } from '@azure/search-documents';
import { RTMiddleTier } from './rtmt';
import { attachRagTools } from './ragtools';

const server = Fastify({ logger: true });
server.register(fastifyWs);
server.register(cors, {
  origin: ['http://localhost:3000'],
  credentials: true,
});

async function main() {
  const llmEndpoint = config.openai.url;
  const llmDeployment = config.openai.model;
  const llmKey = config.openai.apiKey;
  const searchEndpoint = config.openai.searchEndpoint;
  const searchIndex = config.openai.searchIndex;
  const searchKey = config.openai.searchApiKey;

  const credentials = !llmKey || !searchKey ? new DefaultAzureCredential() : null;

  const rtmt = new RTMiddleTier(
    llmEndpoint,
    llmDeployment,
    llmKey ? new AzureKeyCredential(llmKey) : (credentials as unknown as AzureKeyCredential)
  );

  rtmt.systemMessage =
    "You are a helpful assistant. Only answer questions based on information you searched in the knowledge base, accessible with the 'search' tool. " +
    "The user is listening to answers with audio, so it's *super* important that answers are as short as possible, a single sentence if at all possible. " +
    'Never read file names or source names or keys out loud. ' +
    'Always use the following step-by-step instructions to respond: \n' +
    "1. Always use the 'search' tool to check the knowledge base before answering a question. \n" +
    "2. Always use the 'report_grounding' tool to report the source of information from the knowledge base. \n" +
    "3. Produce an answer that's as short as possible. If the answer isn't in the knowledge base, say you don't know.";

  attachRagTools(
    rtmt,
    searchEndpoint,
    searchIndex,
    searchKey ? new AzureKeyCredential(searchKey) : (credentials as DefaultAzureCredential)
  );

  server.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
      rtmt.handleWebSocket(connection);
    });
  });

  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log(`Server listening on ${server.server.address()}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
