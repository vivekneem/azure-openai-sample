//@ts-nocheck
import OpenAI from 'openai';
import { ChatCompletionCreateParams } from 'openai/resources/chat';
import NodeCache from 'node-cache';

export interface ChatConf {
  url: string;
  model: string;
  apiKey: string;
  role?: string;
  apiVersion?: string;
  memory?: number;
  enrich?: (text: string) => Promise<string>;
}

export type CompletionOpts = Partial<ChatCompletionCreateParams>;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class Chat {
  private role = 'AI assistant';
  private apiVersion = '2023-05-15';
  private memory = 10;
  private model: string;
  private ai: OpenAI;
  private cache: NodeCache;
  private enrich?: (message: string) => Promise<string>;

  constructor(conf: ChatConf) {
    this.model = conf.model;
    if (conf.role) this.role = conf.role;
    if (conf.memory) this.memory = conf.memory;
    this.apiVersion = conf.apiVersion || '2023-05-15'; // Ensure this is set
    if (conf.enrich) this.enrich = conf.enrich;

    this.ai = new OpenAI({
      apiKey: conf.apiKey,
      baseURL: `${conf.url}/openai/deployments/${this.model}`,
      defaultQuery: { 'api-version': this.apiVersion },
      defaultHeaders: { 'api-key': conf.apiKey }, // Add this line
    });

    this.cache = new NodeCache({ stdTTL: 60 * 30 }); // 30 minutes
  }

  public async ask(text: string, dlg: string = '', opts: CompletionOpts = {}): Promise<string> {
    const messages = this.setMessage(dlg, 'user', text);
    const enrichedMessages = await this.enrichMessages(messages);

    try {
      const res = await this.ai.chat.completions.create({
        model: this.model,
        messages: enrichedMessages,
        max_tokens: 500,
        temperature: 0.7,
        top_p: 0.95,
        ...opts,
      });

      const answer = res.choices[0]?.message?.content || '';
      answer && this.setMessage(dlg, 'assistant', answer);

      return answer;
    } catch (error) {
      console.error('Error in AI request:', error);
      throw error;
    }
  }

  private async enrichMessages(messages: Message[]): Promise<Message[]> {
    const systemMessage: Message = { role: 'system', content: this.role };

    if (this.enrich) {
      const lastUserMessage = messages[messages.length - 1];
      const facts = await this.enrich(lastUserMessage.content);
      if (facts) {
        systemMessage.content += `\n\nSources:\n${facts.trim()}`;
      }
    }

    return [systemMessage, ...messages];
  }

  private setMessage(scope: string = '', role: 'user' | 'assistant', content: string): Message[] {
    const message: Message = { role, content };
    if (!scope) return [message];

    const messages: Message[] = this.cache.get(scope) || [];
    messages.push(message);

    if (messages.length > this.memory) messages.shift();
    this.cache.set(scope, messages);

    return messages;
  }
}
