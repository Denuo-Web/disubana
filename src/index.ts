import 'dotenv/config';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import nacl from 'tweetnacl';
import type {
  APIInteraction,
  APIChatInputApplicationCommandInteraction,
  APIApplicationCommandInteractionDataOption,
  APIApplicationCommandInteractionDataStringOption
} from 'discord-api-types/v10';
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags
} from 'discord-api-types/v10';
import { handleTask } from './modules/handleTask.js';

const port = Number(process.env.PORT ?? 8080);
const publicKey = process.env.DISCORD_PUBLIC_KEY;

if (!publicKey) {
  throw new Error('Missing required env var DISCORD_PUBLIC_KEY');
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';

const publicKeyBytes = Buffer.from(publicKey, 'hex');
const EPHEMERAL = MessageFlags.Ephemeral;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET') {
      respondHealth(res);
      return;
    }

    if (req.method === 'POST' && getPath(req.url) === '/interactions') {
      await handleInteractionRequest(req, res);
      return;
    }

    respondNotFound(res);
  } catch (error) {
    console.error('Unhandled error in request handler', error);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
});

server.listen(port, () => {
  console.log(`HTTP server listening on ${port}`);
});

function respondHealth(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('ok');
}

function respondNotFound(res: ServerResponse) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain');
  res.end('not found');
}

async function handleInteractionRequest(req: IncomingMessage, res: ServerResponse) {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (typeof signature !== 'string' || typeof timestamp !== 'string') {
    sendJson(res, 401, { error: 'Invalid request signature' });
    return;
  }

  const rawBody = await readRequestBody(req);

  if (!verifyDiscordSignature(signature, timestamp, rawBody)) {
    sendJson(res, 401, { error: 'Bad request signature' });
    return;
  }

  let interaction: APIInteraction;
  try {
    interaction = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    console.error('Failed to parse interaction payload', error);
    sendJson(res, 400, { error: 'Invalid JSON payload' });
    return;
  }

  if (interaction.type === InteractionType.Ping) {
    sendJson(res, 200, { type: InteractionResponseType.Pong });
    return;
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    const command = interaction as APIChatInputApplicationCommandInteraction;
    if (command.data.type !== ApplicationCommandType.ChatInput) {
      sendJson(res, 200, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: 'Unsupported command type.',
          flags: EPHEMERAL,
          allowed_mentions: { parse: [] }
        }
      });
      return;
    }

    const describe = getStringOption(command.data.options, 'describe');
    if (!describe) {
      sendJson(res, 200, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: '⚠️ Missing required `describe` option.',
          flags: EPHEMERAL,
          allowed_mentions: { parse: [] }
        }
      });
      return;
    }

    const projectOption = getStringOption(command.data.options, 'project');
    const sectionOption = getStringOption(command.data.options, 'section');
    const priorityOption = getStringOption(command.data.options, 'priority');

    sendJson(res, 200, {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: {
        flags: EPHEMERAL
      }
    });

    // Process the long-running task off the request lifecycle.
    handleTask({ describe, projectOption, sectionOption, priorityOption })
      .then(async message => {
        await editOriginalResponse(command.application_id, command.token, message);
      })
      .catch(async error => {
        console.error('Failed to process /task command', error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Unexpected error while creating the Asana task.';
        await editOriginalResponse(
          command.application_id,
          command.token,
          `⚠️ Unable to create task: ${message}`
        );
      });

    return;
  }

  sendJson(res, 400, { error: 'Unsupported interaction type' });
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function verifyDiscordSignature(signature: string, timestamp: string, body: Buffer) {
  try {
    const sig = Buffer.from(signature, 'hex');
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), body]);
    return nacl.sign.detached.verify(message, sig, publicKeyBytes);
  } catch (error) {
    console.error('Error verifying Discord signature', error);
    return false;
  }
}

function getStringOption(
  options: readonly APIApplicationCommandInteractionDataOption[] | undefined,
  name: string
) {
  if (!options) return null;
  for (const option of options) {
    if (
      option.name === name &&
      option.type === ApplicationCommandOptionType.String &&
      'value' in option
    ) {
      return (option as APIApplicationCommandInteractionDataStringOption).value;
    }
  }
  return null;
}

async function editOriginalResponse(applicationId: string, interactionToken: string, content: string) {
  try {
    const response = await fetch(
      `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [] }
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('Failed to edit interaction response', response.status, text);
    }
  } catch (error) {
    console.error('Error while editing interaction response', error);
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getPath(url: string | undefined) {
  if (!url) return '/';
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}
