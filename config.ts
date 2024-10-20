import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  OPENAI_URL: z.string(), // Azure OpenAI API URL
  OPENAI_KEY: z.string(), // Azure OpenAI API key
  OPENAI_MODEL: z.string(), // OpenAI model ID
  OPENAI_EMBEDDING_MODEL: z.string(), // OpenAI embedding model ID
  AZURE_SEARCH_ENDPOINT: z.string(), // Azure Search endpoint
  AZURE_SEARCH_INDEX: z.string(), // Azure Search index
  AZURE_SEARCH_API_KEY: z.string(), // Azure Search API key
  PORT: z.string().optional(), // Server port
});

const env = envSchema.parse(process.env);

export const config = {
  openai: {
    url: env.OPENAI_URL,
    apiKey: env.OPENAI_KEY,
    model: env.OPENAI_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    apiVersion: '2024-10-01-preview',
    searchEndpoint: env.AZURE_SEARCH_ENDPOINT,
    searchIndex: env.AZURE_SEARCH_INDEX,
    searchApiKey: env.AZURE_SEARCH_API_KEY,
  },
  server: {
    port: parseInt(env.PORT || '3001', 10),
  },
};
