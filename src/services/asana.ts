import { ApiClient, TasksApi } from 'asana';

const accessToken = process.env.ASANA_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error('Missing required env var ASANA_ACCESS_TOKEN');
}

const apiClient = ApiClient.instance;
apiClient.authentications.token.accessToken = accessToken;

const tasksApi = new TasksApi(apiClient);

export async function createAsanaTask(params: {
  name: string;
  notes: string;
  projectGid: string;
  sectionRef: string; // section GID preferred; name requires lookup
}) {
  // 1) create the task and place directly into a section using memberships
  const response = await tasksApi.createTask({
    data: {
      name: params.name,
      notes: params.notes,
      projects: [params.projectGid],
      memberships: [{ project: params.projectGid, section: params.sectionRef }]
    }
  });

  const task = response?.data;
  if (!task?.gid) {
    throw new Error('Asana task creation returned no task gid');
  }

  // If you cannot supply section at creation time, add it in a second call:
  // await client.sections.addTaskForSection(params.sectionRef, { task: task.gid });

  return `https://app.asana.com/0/${params.projectGid}/${task.gid}`;
}
