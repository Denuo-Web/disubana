import type { ChatInputCommandInteraction } from 'discord.js';
import { findRepoContext } from '../services/github.js';
import { extractTask } from '../services/openai.js';
import { createAsanaTask } from '../services/asana.js';

export async function handleTask(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (error) {
    console.error('Failed to defer /task reply', error);
    return;
  }

  try {
    const describe = interaction.options.getString('describe', true);
    const projectGid = interaction.options.getString('project') ?? process.env.ASANA_PROJECT_GID;
    const sectionHint = interaction.options.getString('section') ?? process.env.ASANA_SECTION_GID;
    const priority = interaction.options.getString('priority') ?? 'p2';

    if (!projectGid) {
      throw new Error('No Asana project configured. Provide `project` option or set ASANA_PROJECT_GID.');
    }

    if (!sectionHint) {
      throw new Error('No Asana section configured. Provide `section` option or set ASANA_SECTION_GID.');
    }

    const repoContext = await findRepoContext(describe); // list of {path, repo, fragment, url}
    const task = await extractTask({ describe, priority, repoContext });

    const asanaUrl = await createAsanaTask({
      name: task.title,
      notes: task.body,
      projectGid,
      sectionRef: sectionHint
    });

    await interaction.editReply(`Created: ${asanaUrl}`);
  } catch (error) {
    console.error('Failed to process /task command', error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unexpected error while creating the Asana task.';

    try {
      await interaction.editReply(`⚠️ Unable to create task: ${message}`);
    } catch (followupError) {
      console.error('Unable to send /task failure message', followupError);
    }
  }
}
