// MathJax 4 setup — issue #10 configures the full explorer behaviour; this file
// is the loader and the typeset helper the whole app uses.
//
// The accessibility extension is what makes an equation navigable: arrow keys
// walk the expression tree, speech describes each sub-expression, and braille
// subtitles show the Nemeth output. None of that works unless `enableExplorer`
// and `enableSpeech` are on before MathJax loads.

declare global {
  interface Window {
    MathJax: any;
  }
}

const MATHJAX_SRC =
  'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-chtml.js';

let loading: Promise<void> | null = null;

export function configureMathJax(): void {
  if (window.MathJax) return;
  window.MathJax = {
    tex: {
      // String.raw, or the backslashes become escape sequences and the
      // delimiters silently stop matching.
      inlineMath: [[String.raw`\(`, String.raw`\)`]],
      displayMath: [
        [String.raw`\[`, String.raw`\]`],
        ['$$', '$$'],
      ],
    },
    options: {
      enableMenu: true,
      // Verified against MathJax 4.1.3 at runtime — these are the real option
      // names. An unrecognised one is only a console warning, so a typo here
      // silently leaves the explorer off. If you change anything in this block,
      // check the console for "Invalid option".
      enableSpeech: true,
      enableBraille: true,
      // Explorer is what makes arrow-key navigation inside an equation work.
      enableExplorer: true,
      enableExplorerHelp: true,
      sre: {
        // 'none' is the default and produces no speech strings at all.
        speech: 'deep',
        locale: 'en',
        // ClearSpeak reads closer to how a teacher says it than MathSpeak.
        domain: 'clearspeak',
        style: 'default',
        braille: 'nemeth',
        structure: true,
        aria: true,
      },
      menuOptions: {
        settings: {
          speech: true,
          braille: true,
          brailleCode: 'nemeth',
          speechRules: 'clearspeak-default',
          // Off deliberately. The line wrapper is the tab stop; pressing Enter
          // on it moves focus into the equation (DESIGN.md 12). With this on,
          // every line becomes two tab stops, which is noise for a screen
          // reader user moving through a problem.
          inTabOrder: false,
          tabSelects: 'all',
          enrich: true,
          // DESIGN.md 12 asks for a keyboard magnifier. MathJax 3's explorer
          // had `magnification: 'Keyboard'`; 4.1.3 has removed it — only these
          // pointer-triggered zoom settings remain, confirmed by inspecting the
          // live document. Click-to-zoom still helps a low-vision user with a
          // pointer, and keyboard magnification is covered properly by
          // low-vision mode (issue #12), which is a P0 ticket of its own.
          zoom: 'Click',
          zscale: '400%',
        },
      },
    },
    startup: {
      typeset: false,
    },
  };
}

export function loadMathJax(): Promise<void> {
  if (loading) return loading;
  configureMathJax();

  loading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-mathjax]',
    );
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = MATHJAX_SRC;
    s.async = true;
    s.dataset.mathjax = 'true';
    s.onload = () => {
      window.MathJax.startup.promise
        .then(() => {
          // Apply the tab-order setting to the live document. Setting it in the
          // config alone does not re-apply to containers the explorer touches
          // later, and we want exactly one tab stop per line.
          try {
            window.MathJax.startup.document?.menu?.setTabOrder?.(false);
          } catch {
            // Menu not available in this build — MathLine enforces it per line.
          }
        })
        .then(resolve)
        .catch(reject);
    };
    s.onerror = () => reject(new Error('MathJax failed to load'));
    document.head.appendChild(s);
  });

  return loading;
}

/** Render math inside `el`. Always await this before reading the result. */
export async function typeset(el: HTMLElement): Promise<void> {
  await loadMathJax();
  if (window.MathJax?.typesetPromise) {
    await window.MathJax.typesetPromise([el]);
  }
}

/** True once MathJax has loaded and the explorer is available. */
export function isReady(): boolean {
  return Boolean(window.MathJax?.typesetPromise);
}
