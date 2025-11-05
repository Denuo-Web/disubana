declare module 'asana' {
  export interface TaskResponse {
    data?: { gid?: string };
  }

  export class ApiClient {
    static instance: ApiClient;
    authentications: {
      token: {
        accessToken?: string;
      };
    };
  }

  export class TasksApi {
    constructor(apiClient: ApiClient);
    createTask(input: {
      data: {
        name: string;
        notes: string;
        projects: string[];
        memberships: Array<{ project: string; section: string }>;
      };
    }): Promise<TaskResponse>;
  }
}
