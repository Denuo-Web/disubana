import 'dotenv/config';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { handleTask } from './modules/handleTask.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds] // no Message Content intent by default
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
