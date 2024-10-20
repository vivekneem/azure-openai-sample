//@ts-nocheck
import { AzureKeyCredential, SearchClient } from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { RTMiddleTier, Tool, ToolResult, ToolResultDirection } from './rtmt';

const searchToolSchema = {
  type: 'function',
  name: 'search',
  description:
    'Search the knowledge base. The knowledge base is in English, translate to and from English if ' +
    'needed. Results are formatted as a source name first in square brackets, followed by the text ' +
    "content, and a line with '-----' at the end of each result.",
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

const groundingToolSchema = {
  type: 'function',
  name: 'report_grounding',
  description:
    'Report use of a source from the knowledge base as part of an answer (effectively, cite the source). Sources ' +
    'appear in square brackets before each knowledge base passage. Always use this tool to cite sources when responding ' +
    'with information from the knowledge base.',
  parameters: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'List of source names from last statement actually used, do not include the ones not used to formulate a response',
      },
    },
    required: ['sources'],
    additionalProperties: false,
  },
};

async function searchTool(searchClient: SearchClient<any>, args: any): Promise<ToolResult> {
  console.log(`Searching for '${args.query}' in the knowledge base.`);
  // Hybrid + Reranking query using Azure AI Search
  const searchResults = await searchClient.search(args.query, {
    queryType: 'semantic',
    top: 5,
    vectorQueries: [
      {
        kind: 'text',
        text: args.query,
        kNearestNeighborsCount: 50,
        fields: ['text_vector'],
      },
    ],
    select: ['chunk_id', 'title', 'chunk'],
  });

  console.log('searchResults: ', searchResults);

  let result = '';
  for await (const r of searchResults.results) {
    result += `[${r.chunk_id}]: ${r.chunk}\n-----\n`;
  }
  return new ToolResult(result, ToolResultDirection.TO_SERVER);
}

const KEY_PATTERN = /^[a-zA-Z0-9_=\-]+$/;

async function reportGroundingTool(searchClient: SearchClient<any>, args: any): Promise<ToolResult> {
  const sources = args.sources.filter((s: string) => KEY_PATTERN.test(s));
  const list = sources.join(' OR ');
  console.log(`Grounding source: ${list}`);

  const searchResults = await searchClient.search(list, {
    searchFields: ['chunk_id'],
    select: ['chunk_id', 'title', 'chunk'],
    top: sources.length,
    queryType: 'full',
  });

  const docs = [];
  for await (const r of searchResults.results) {
    docs.push({ chunk_id: r.chunk_id, title: r.title, chunk: r.chunk });
  }
  return new ToolResult({ sources: docs }, ToolResultDirection.TO_CLIENT);
}

export function attachRagTools(
  rtmt: RTMiddleTier,
  searchEndpoint: string,
  searchIndex: string,
  credentials: AzureKeyCredential | DefaultAzureCredential
): void {
  console.log('I am here in attachRagTools');
  if (!(credentials instanceof AzureKeyCredential)) {
    (credentials as DefaultAzureCredential).getToken('https://search.azure.com/.default');
  }
  const searchClient = new SearchClient(searchEndpoint, searchIndex, credentials, {
    userAgentOptions: { userAgentPrefix: 'RTMiddleTier' },
  });

  rtmt.tools['search'] = new Tool(searchToolSchema, (args: any) => searchTool(searchClient, args));
  rtmt.tools['report_grounding'] = new Tool(groundingToolSchema, (args: any) =>
    reportGroundingTool(searchClient, args)
  );
}
