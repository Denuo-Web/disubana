import type { ChatInputCommandInteraction } from 'discord.js';
import { findRepoContext } from '../services/github.js';
import { extractTask } from '../services/openai.js';
import { createAsanaTask } from '../services/asana.js';

export async function handleTask(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const describe = interaction.options.getString('describe', true);
  const projectGid = interaction.options.getString('project') ?? process.env.ASANA_PROJECT_GID!;
  const sectionHint = interaction.options.getString('section') ?? process.env.ASANA_SECTION_GID!;
  const priority = interaction.options.getString('priority') ?? 'p2';

  const repoContext = await findRepoContext(describe); // list of {path, repo, fragment, url}
  const task = await extractTask({ describe, priority, repoContext });

  const asanaUrl = await createAsanaTask({
    name: task.title,
    notes: task.body,
    projectGid,
    sectionRef: sectionHint
  });

  await interaction.editReply(`Created: ${asanaUrl}`);
}
