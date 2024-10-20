import WebSocket from 'ws';
import { AzureKeyCredential, TokenCredential } from '@azure/core-auth';
import { DefaultAzureCredential } from '@azure/identity';

export enum ToolResultDirection {
  TO_SERVER = 1,
  TO_CLIENT = 2,
}

export class ToolResult {
  text: string | object;
  destination: ToolResultDirection;

  constructor(text: string | object, destination: ToolResultDirection) {
    this.text = text;
    this.destination = destination;
  }

  toText(): string {
    if (this.text === null || this.text === undefined) {
      return '';
    }
    return typeof this.text === 'string' ? this.text : JSON.stringify(this.text);
  }
}

export class Tool {
  target: (...args: any[]) => ToolResult;
  schema: any;

  constructor(target: (...args: any[]) => ToolResult, schema: any) {
    this.target = target;
    this.schema = schema;
  }
}

class RTToolCall {
  toolCallId: string;
  previousId: string;

  constructor(toolCallId: string, previousId: string) {
    this.toolCallId = toolCallId;
    this.previousId = previousId;
  }
}

export class RTMiddleTier {
  endpoint: string;
  deployment: string;
  key?: string;
  tools: { [key: string]: Tool } = {};
  model?: string;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
  disableAudio?: boolean;

  public toolsPending: { [key: string]: RTToolCall } = {};
  private tokenProvider?: () => Promise<string>;

  constructor(endpoint: string, deployment: string, credentials: AzureKeyCredential | TokenCredential) {
    this.endpoint = endpoint;
    this.deployment = deployment;
    if (credentials instanceof AzureKeyCredential) {
      this.key = credentials.key;
    } else {
      this.tokenProvider = async () =>
        (await (credentials as DefaultAzureCredential).getToken('https://cognitiveservices.azure.com/.default')).token;
      this.tokenProvider(); // Warm up during startup
    }
  }

  private async processMessageToClient(msg: string, clientWs: WebSocket, serverWs: WebSocket): Promise<string | null> {
    const message = JSON.parse(msg);
    let updatedMessage = msg;

    switch (message.type) {
      case 'session.created':
        const session = message.session;
        session.instructions = '';
        session.tools = [];
        session.tool_choice = 'none';
        session.max_response_output_tokens = null;
        updatedMessage = JSON.stringify(message);
        break;

      case 'response.output_item.added':
        if (message.item?.type === 'function_call') {
          updatedMessage = JSON.stringify(message);
        }
        break;

      case 'conversation.item.created':
        if (message.item?.type === 'function_call') {
          const item = message.item;
          if (!(item.call_id in this.toolsPending)) {
            this.toolsPending[item.call_id] = new RTToolCall(item.call_id, message.previous_item_id);
          }
          updatedMessage = '';
        } else if (message.item?.type === 'function_call_output') {
          updatedMessage = '';
        }
        break;

      case 'response.function_call_arguments.delta':
      case 'response.function_call_arguments.done':
        updatedMessage = '';
        break;

      case 'response.output_item.done':
        if (message.item?.type === 'function_call') {
          console.log('message.item?.type === function_call: ', message.item);
          const item = message.item;
          const toolCall = this.toolsPending[item.call_id];
          const tool = this.tools[item.name];
          let args;
          try {
            args = JSON.parse(item.arguments);
          } catch (error) {
            // If JSON parsing fails, try to parse it as a query string
            args = Object.fromEntries(new URLSearchParams(item.arguments));
          }
          const result = await tool.target(args);
          console.log('result: ', result);
          await serverWs.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: item.call_id,
                output: result.destination === ToolResultDirection.TO_SERVER ? result.toText() : '',
              },
            })
          );
          if (result.destination === ToolResultDirection.TO_CLIENT) {
            await clientWs.send(
              JSON.stringify({
                type: 'extension.middle_tier_tool_response',
                previous_item_id: toolCall.previousId,
                tool_name: item.name,
                tool_result: result.toText(),
              })
            );
          }
          updatedMessage = '';
        }
        break;

      case 'response.done':
        if (Object.keys(this.toolsPending).length > 0) {
          console.log('this.toolsPending: ', this.toolsPending);
          this.toolsPending = {};
          await serverWs.send(
            JSON.stringify({
              type: 'response.create',
            })
          );
        }
        if (message.response) {
          let replace = false;
          for (let i = message.response.output.length - 1; i >= 0; i--) {
            if (message.response.output[i].type === 'function_call') {
              message.response.output.splice(i, 1);
              replace = true;
            }
          }
          if (replace) {
            updatedMessage = JSON.stringify(message);
          }
        }
        break;
    }

    return updatedMessage;
  }

  private async processMessageToServer(msg: string): Promise<string | null> {
    const message = JSON.parse(msg);
    let updatedMessage = msg;

    if (message.type === 'session.update') {
      const session = message.session;
      if (this.systemMessage !== null) {
        console.log('this.systemMessage: ', this.systemMessage);
        session.instructions = this.systemMessage;
      }
      if (this.temperature !== null) {
        session.temperature = this.temperature;
      }
      if (this.maxTokens !== null) {
        session.max_response_output_tokens = this.maxTokens;
      }
      if (this.disableAudio !== null) {
        session.disable_audio = this.disableAudio;
      }
      session.tool_choice = Object.keys(this.tools).length > 0 ? 'auto' : 'none';
      session.tools = Object.values(this.tools).map((tool) => tool.schema);
      updatedMessage = JSON.stringify(message);
    }

    return updatedMessage;
  }

  async handleWebSocket(ws: WebSocket): Promise<void> {
    const serverWs = new WebSocket(
      `${this.endpoint}/openai/realtime?api-version=2024-10-01-preview&deployment=${this.deployment}`,
      {
        headers: this.key ? { 'api-key': this.key } : { Authorization: `Bearer ${await this.tokenProvider!()}` },
      }
    );

    serverWs.on('open', () => {
      console.log('Connected to Azure OpenAI');
    });

    serverWs.on('message', async (data: WebSocket.Data) => {
      const msg = data.toString();
      const processedMsg = await this.processMessageToClient(msg, ws, serverWs);
      if (processedMsg !== null) {
        ws.send(processedMsg);
      }
    });

    ws.on('message', async (data: WebSocket.Data) => {
      const msg = data.toString();
      const processedMsg = await this.processMessageToServer(msg);
      if (processedMsg !== null) {
        serverWs.send(processedMsg);
      }
    });

    ws.on('close', () => {
      serverWs.close();
    });

    serverWs.on('close', () => {
      ws.close();
    });
  }
}
