import './seo-pages.css';

type RequestedMode = 'build' | 'plan';

function setHandoff(prompt: string, mode: RequestedMode) {
  sessionStorage.setItem('huggy-initial-prompt', prompt);
  sessionStorage.setItem('huggy-requested-mode', mode);
  window.location.href = '/builder.html?new=1';
}

function initSeoPromptForms() {
  document.querySelectorAll<HTMLElement>('[data-seo-prompt-form]').forEach(form => {
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[data-seo-prompt]');
    const modeInput = form.querySelector<HTMLInputElement>('input[data-seo-mode]');
    const submit = form.querySelector<HTMLButtonElement>('[data-seo-submit]');
    if (!textarea || !submit) return;

    form.querySelectorAll<HTMLButtonElement>('[data-seo-mode-button]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.seoModeButton === 'plan' ? 'plan' : 'build';
        if (modeInput) modeInput.value = mode;
        form.querySelectorAll('[data-seo-mode-button]').forEach(item => item.classList.remove('secondary'));
        button.classList.remove('secondary');
        form.querySelectorAll<HTMLButtonElement>('[data-seo-mode-button]').forEach(item => {
          if (item !== button) item.classList.add('secondary');
        });
      });
    });

    submit.addEventListener('click', () => {
      const prompt = textarea.value.trim() || textarea.placeholder || 'Create a production-ready web app with Huggy';
      const mode = modeInput?.value === 'plan' ? 'plan' : 'build';
      setHandoff(prompt, mode);
    });

    textarea.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        submit.click();
      }
    });
  });
}

function initRecipeButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-huggy-prompt]').forEach(button => {
    button.addEventListener('click', () => {
      const prompt = button.dataset.huggyPrompt || 'Create a production-ready web app with Huggy';
      const mode = button.dataset.huggyMode === 'plan' ? 'plan' : 'build';
      setHandoff(prompt, mode);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSeoPromptForms();
  initRecipeButtons();
});
