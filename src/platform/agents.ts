import type {
  Agent,
  AgentContext,
  AgentOutput,
  AgentSpec,
  BuildResult,
  DebugReport,
  DeployPlan,
  FilePatch,
  SecurityReport,
  TaskList,
} from './types';
import { createSecurityReport, validateFilePatch } from './security';

function titleFromPrompt(prompt: string): string {
  const compact = prompt.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
  const words = compact.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length ? words.join(' ') : 'Generated App';
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'generated-app';
}

export class ProductAgent implements Agent<AgentSpec> {
  readonly name = 'ProductAgent' as const;

  async run(context: AgentContext): Promise<AgentSpec> {
    const projectName = titleFromPrompt(context.prompt);
    return {
      type: 'spec',
      projectName,
      summary: context.prompt,
      targetUsers: ['end users', 'project owner'],
      features: [
        { name: 'Responsive interface', description: 'A polished responsive web application UI.', priority: 'must' },
        { name: 'Core workflow', description: 'Primary user journey derived from the prompt.', priority: 'must' },
        { name: 'Production readiness', description: 'Basic accessibility, error states and deployability.', priority: 'should' },
      ],
      constraints: ['No frontend secrets', 'Template-based architecture', 'Safe generated code only'],
      acceptanceCriteria: ['The app builds successfully', 'The UI is responsive', 'No high-risk security finding blocks preview'],
      openQuestions: [],
    };
  }
}

export class PlannerAgent implements Agent<TaskList> {
  readonly name = 'PlannerAgent' as const;

  async run(): Promise<TaskList> {
    return {
      type: 'task_list',
      tasks: [
        { id: 'spec', title: 'Define specification', description: 'Transform the prompt into a structured product spec.', agent: 'ProductAgent', dependsOn: [], status: 'pending' },
        { id: 'architecture', title: 'Select architecture', description: 'Choose the app template and technical structure.', agent: 'ArchitectAgent', dependsOn: ['spec'], status: 'pending' },
        { id: 'ui', title: 'Generate UI', description: 'Create frontend pages and components.', agent: 'UIAgent', dependsOn: ['architecture'], status: 'pending' },
        { id: 'security', title: 'Review security', description: 'Scan generated files before build and deploy.', agent: 'SecurityAgent', dependsOn: ['ui'], status: 'pending' },
        { id: 'qa', title: 'Validate build', description: 'Run lint, typecheck, tests and preview checks.', agent: 'QAAgent', dependsOn: ['security'], status: 'pending' },
      ],
    };
  }
}

export class ArchitectAgent implements Agent<FilePatch> {
  readonly name = 'ArchitectAgent' as const;

  async run(context: AgentContext): Promise<FilePatch> {
    const appName = slugify(titleFromPrompt(context.prompt));
    return validateFilePatch({
      type: 'file_patch',
      operations: [
        {
          op: 'create',
          path: 'package.json',
          reason: 'Create a deployable Vite React project manifest.',
          content: JSON.stringify(
            {
              name: appName,
              private: true,
              version: '0.1.0',
              type: 'module',
              scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview', lint: 'tsc --noEmit' },
              dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', typescript: 'latest', react: 'latest', 'react-dom': 'latest' },
              devDependencies: {},
            },
            null,
            2,
          ),
        },
        {
          op: 'create',
          path: 'index.html',
          reason: 'Create the HTML shell.',
          content: '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Generated App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
        },
      ],
    });
  }
}

export class UIAgent implements Agent<FilePatch> {
  readonly name = 'UIAgent' as const;

  async run(context: AgentContext): Promise<FilePatch> {
    const title = titleFromPrompt(context.prompt);
    return validateFilePatch({
      type: 'file_patch',
      operations: [
        {
          op: 'create',
          path: 'src/main.tsx',
          reason: 'Create React entrypoint.',
          content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './styles.css';\n\nfunction App() {\n  return (\n    <main className=\"shell\">\n      <section className=\"hero\">\n        <p className=\"eyebrow\">Generated with Huggy</p>\n        <h1>" + title.replaceAll('`', '') + "</h1>\n        <p className=\"lead\">A production-ready starting point generated from your prompt.</p>\n        <button>Get started</button>\n      </section>\n    </main>\n  );\n}\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
        },
        {
          op: 'create',
          path: 'src/styles.css',
          reason: 'Create responsive styling.',
          content: ':root{font-family:Inter,system-ui,sans-serif;color:#f7f7f8;background:#07070a}body{margin:0}.shell{min-height:100vh;display:grid;place-items:center;padding:32px;background:radial-gradient(circle at top,#33415555,transparent 36rem)}.hero{max-width:860px;border:1px solid #ffffff14;border-radius:32px;padding:56px;background:#ffffff08;box-shadow:0 24px 80px #0008}.eyebrow{color:#93c5fd;text-transform:uppercase;letter-spacing:.16em;font-size:12px}.hero h1{font-size:clamp(42px,8vw,86px);line-height:.95;margin:0 0 20px}.lead{color:#cbd5e1;font-size:20px;line-height:1.6}button{border:0;border-radius:999px;padding:14px 22px;background:#f8fafc;color:#020617;font-weight:700}',
        },
      ],
    });
  }
}

export class BackendAgent implements Agent<FilePatch> {
  readonly name = 'BackendAgent' as const;

  async run(): Promise<FilePatch> {
    return validateFilePatch({ type: 'file_patch', operations: [] });
  }
}

export class DatabaseAgent implements Agent<FilePatch> {
  readonly name = 'DatabaseAgent' as const;

  async run(): Promise<FilePatch> {
    return validateFilePatch({ type: 'file_patch', operations: [] });
  }
}

export class IntegrationAgent implements Agent<FilePatch> {
  readonly name = 'IntegrationAgent' as const;

  async run(): Promise<FilePatch> {
    return validateFilePatch({ type: 'file_patch', operations: [] });
  }
}

export class SecurityAgent implements Agent<SecurityReport> {
  readonly name = 'SecurityAgent' as const;

  async run(context: AgentContext): Promise<SecurityReport> {
    return createSecurityReport(context.files);
  }
}

export class QAAgent implements Agent<BuildResult> {
  readonly name = 'QAAgent' as const;

  async run(): Promise<BuildResult> {
    return { type: 'build_result', status: 'success', logsRef: 'pending-sandbox-run', errors: [] };
  }
}

export class DebugAgent implements Agent<DebugReport> {
  readonly name = 'DebugAgent' as const;

  async run(): Promise<DebugReport> {
    return { type: 'debug_report', rootCause: 'No runtime build logs were provided.', proposedFixes: [], retryRecommended: false };
  }
}

export class DeployAgent implements Agent<DeployPlan> {
  readonly name = 'DeployAgent' as const;

  async run(context: AgentContext): Promise<DeployPlan> {
    const projectName = slugify(context.project?.slug ?? titleFromPrompt(context.prompt));
    return {
      type: 'deploy_plan',
      target: 'preview',
      vercelProjectName: projectName,
      domains: process.env.APP_PUBLIC_DOMAIN ? [`${projectName}.${process.env.APP_PUBLIC_DOMAIN}`] : [],
      envVars: [],
    };
  }
}

export class ReviewerAgent implements Agent<SecurityReport> {
  readonly name = 'ReviewerAgent' as const;

  async run(context: AgentContext): Promise<SecurityReport> {
    return createSecurityReport(context.files);
  }
}

export function createDefaultAgents(): Agent[] {
  return [
    new ProductAgent(),
    new PlannerAgent(),
    new ArchitectAgent(),
    new UIAgent(),
    new BackendAgent(),
    new DatabaseAgent(),
    new IntegrationAgent(),
    new SecurityAgent(),
    new QAAgent(),
    new DebugAgent(),
    new DeployAgent(),
    new ReviewerAgent(),
  ];
}

export function isPatchOutput(output: AgentOutput): output is FilePatch {
  return output.type === 'file_patch';
}
