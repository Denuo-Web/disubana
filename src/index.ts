import 'dotenv/config';
import http from 'node:http';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { handleTask } from './modules/handleTask.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds] // no Message Content intent by default
});

const port = Number(process.env.PORT ?? 8080);

// Cloud Run needs an HTTP listener for health checks.
const server = http.createServer((_, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('ok');
});

server.listen(port, () => {
  console.log(`Health check server listening on ${port}`);
});

client.once(Events.ClientReady, c => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'task') return;
  await handleTask(interaction);
});

await client.login(process.env.DISCORD_TOKEN);
