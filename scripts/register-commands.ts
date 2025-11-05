import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const cmd = new SlashCommandBuilder()
  .setName('task')
  .setDescription('Create an Asana task from a description and repo context')
  .addStringOption(o => o.setName('describe').setDescription('Task idea').setRequired(true))
  .addStringOption(o => o.setName('project').setDescription('Asana project GID'))
  .addStringOption(o => o.setName('section').setDescription('Asana section name or GID').setRequired(false))
  .addStringOption(o => o.setName('priority').setDescription('p0/p1/p2').setRequired(false));

const body = [cmd.toJSON()];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), { body });
console.log('Commands registered');
