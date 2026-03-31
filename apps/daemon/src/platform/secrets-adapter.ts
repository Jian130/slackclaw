import type { SupportedChannelId } from "@chillclaw/contracts";

export interface SecretsAdapter {
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export class NoopSecretsAdapter implements SecretsAdapter {
  async get(_name: string): Promise<string | undefined> {
    return undefined;
  }

  async set(_name: string, _value: string): Promise<void> {}

  async delete(_name: string): Promise<void> {}
}

export class InMemorySecretsAdapter implements SecretsAdapter {
  private readonly values = new Map<string, string>();

  async get(name: string): Promise<string | undefined> {
    return this.values.get(name);
  }

  async set(name: string, value: string): Promise<void> {
    this.values.set(name, value);
  }

  async delete(name: string): Promise<void> {
    this.values.delete(name);
  }
}

export function channelSecretName(channelId: SupportedChannelId, entryId: string, fieldId: string): string {
  return `chillclaw.channel.${channelId}.${entryId}.${fieldId}`;
}

export function modelAuthSecretName(providerId: string, methodId: string, fieldId: string): string {
  return `chillclaw.model-auth.${providerId}.${methodId}.${fieldId}`;
}
