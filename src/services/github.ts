import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_INSTALLATION_TOKEN ?? process.env.GITHUB_TOKEN });

export async function findRepoContext(query: string) {
  // basic, deterministic search; tune the qualifiers for your org
  const q = [
    `${query}`,
    `org:your-org`,
    `in:file`,
    `language:ts OR language:py`
  ].join(' ');
  const res = await octokit.search.code({ q, per_page: 5 });
  return res.data.items.map(i => ({
    repo: i.repository.full_name,
    path: i.path,
    url: i.html_url
  }));
}
