export type DesignWorkshopAction =
  | 'autopilot'
  | 'anti_ai'
  | 'premium'
  | 'mobile'
  | 'harmonize'
  | 'audit'
  | 'variants';

export type DesignWorkshopScope = 'focused' | 'element' | 'section' | 'page' | 'app';
export type DesignWorkshopTarget = 'auto' | 'desktop' | 'tablet' | 'mobile';
export type DesignWorkshopDirection =
  | 'auto'
  | 'soft_saas'
  | 'saas_premium'
  | 'enterprise_clean'
  | 'startup_yc'
  | 'minimal_luxury';

export type DesignWorkshopSettings = {
  action: DesignWorkshopAction;
  scope: DesignWorkshopScope;
  target: DesignWorkshopTarget;
  direction: DesignWorkshopDirection;
};

export const DESIGN_WORKSHOP_OPTIONS: {
  action: Array<{ value: DesignWorkshopAction; label: string; hint: string }>;
  scope: Array<{ value: DesignWorkshopScope; label: string; hint: string }>;
  target: Array<{ value: DesignWorkshopTarget; label: string; hint: string }>;
  direction: Array<{ value: DesignWorkshopDirection; label: string; hint: string }>;
} = {
  action: [
    { value: 'autopilot', label: 'Autopilot', hint: 'Best safe polish' },
    { value: 'anti_ai', label: 'Anti-AI fix', hint: 'Less generic' },
    { value: 'premium', label: 'Premium', hint: 'Stronger UI' },
    { value: 'mobile', label: 'Mobile', hint: 'Responsive pass' },
    { value: 'harmonize', label: 'Harmonize', hint: 'Tokens + consistency' },
    { value: 'audit', label: 'Audit', hint: 'Score first' },
    { value: 'variants', label: 'Variants', hint: 'Explore looks' },
  ],
  scope: [
    { value: 'focused', label: 'Focused', hint: 'Smallest safe scope' },
    { value: 'element', label: 'Element', hint: 'Selected thing' },
    { value: 'section', label: 'Section', hint: 'Current block' },
    { value: 'page', label: 'Page', hint: 'One page' },
    { value: 'app', label: 'Whole app', hint: 'Global design pass' },
  ],
  target: [
    { value: 'auto', label: 'Auto target', hint: 'Huggy decides' },
    { value: 'desktop', label: 'Desktop', hint: 'Large screens' },
    { value: 'tablet', label: 'Tablet', hint: 'Mid screens' },
    { value: 'mobile', label: 'Mobile', hint: 'Small screens' },
  ],
  direction: [
    { value: 'auto', label: 'Auto style', hint: 'Project fit' },
    { value: 'soft_saas', label: 'Soft SaaS', hint: 'Calm + clear' },
    { value: 'saas_premium', label: 'SaaS premium', hint: 'Product-led' },
    { value: 'enterprise_clean', label: 'Enterprise', hint: 'Dense + calm' },
    { value: 'startup_yc', label: 'Startup YC', hint: 'Sharp + direct' },
    { value: 'minimal_luxury', label: 'Minimal luxury', hint: 'Quiet polish' },
  ],
};

export function designWorkshopOptionLabel<K extends keyof typeof DESIGN_WORKSHOP_OPTIONS>(
  key: K,
  value: string,
) {
  return DESIGN_WORKSHOP_OPTIONS[key].find(option => option.value === value)?.label || String(value);
}

export function normalizeDesignWorkshopSettings(value: any): DesignWorkshopSettings {
  const pick = <K extends keyof typeof DESIGN_WORKSHOP_OPTIONS>(key: K, fallback: DesignWorkshopSettings[K]) => {
    const allowed = DESIGN_WORKSHOP_OPTIONS[key].map(option => option.value);
    return allowed.includes(value?.[key]) ? value[key] : fallback;
  };

  return {
    action: pick('action', 'autopilot'),
    scope: pick('scope', 'focused'),
    target: pick('target', 'auto'),
    direction: pick('direction', 'auto'),
  };
}

export function designWorkshopSummary(settings: DesignWorkshopSettings) {
  return [
    designWorkshopOptionLabel('action', settings.action),
    designWorkshopOptionLabel('scope', settings.scope),
    designWorkshopOptionLabel('target', settings.target),
    designWorkshopOptionLabel('direction', settings.direction),
  ].join(' · ');
}

export function designWorkshopInstructionLines(settings: DesignWorkshopSettings) {
  const lines = [
    `- Current design settings: ${designWorkshopSummary(settings)}.`,
    '- Treat these controls as context, not as a command to rewrite the whole project.',
  ];

  if (settings.action === 'audit') {
    lines.push('- Start with a design audit and do not modify files unless the user asks to apply fixes.');
  }
  if (settings.action === 'anti_ai') {
    lines.push('- Prioritize removing generic AI patterns: vague hero, repeated cards, clichéd gradients, fake metrics, weak CTA hierarchy.');
  }
  if (settings.action === 'mobile' || settings.target === 'mobile') {
    lines.push('- Prioritize mobile usability: readable text, tap targets, no horizontal overflow, compact navigation and clear CTA placement.');
  }
  if (settings.action === 'variants') {
    lines.push('- Provide or generate distinct visual directions; apply one only when the user asks to apply it.');
  }
  if (settings.scope === 'focused' || settings.scope === 'element') {
    lines.push('- Use the smallest safe patch. Do not redesign unrelated sections.');
  }
  if (settings.scope === 'app') {
    lines.push('- Keep behavior and data intact while harmonizing visual tokens, layout rhythm and component consistency across the app.');
  }
  if (settings.direction !== 'auto') {
    lines.push(`- Visual direction preference: ${designWorkshopOptionLabel('direction', settings.direction)}.`);
  }
  return lines;
}
