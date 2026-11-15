import { expect, test } from '@playwright/test';

type SpeechWindow = Window & { recordedSpeech: string[] };

for (const selfVoicing of [false, true]) {
  test(`@smoke low vision reads the position and math together (settings voice ${selfVoicing ? 'on' : 'off'})`, async ({ page }) => {
    await page.addInitScript((enabled) => {
      const speechWindow = window as SpeechWindow;
      speechWindow.recordedSpeech = [];
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: class { constructor(readonly text: string) {} },
      });
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          cancel: () => {},
          speak: (utterance: SpeechSynthesisUtterance) => {
            speechWindow.recordedSpeech.push(utterance.text);
          },
        },
      });
      const lines = ['2x + 3 = 11', String.raw`\frac{\sqrt{x + 1}}{2} = 5`];
      localStorage.setItem('glance.problem.v1', JSON.stringify({
        instructions: '', source: 'upload', diagrams: [], warnings: [],
        lines: lines.map((latex, i) => ({
          id: `L${i + 1}`, latex, confidence: 1, intent_notes: '', valid: true,
        })),
      }));
      localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'homework', selfVoicing: enabled }));
    }, selfVoicing);

    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await expect(page.locator('#L2 mjx-container')).toHaveAttribute(
      'data-semantic-speech-none', /the fraction/i, { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Low-vision mode' }).click();
    const stage = page.getByRole('region', { name: 'Low-vision mode' });
    if (selfVoicing) {
      await expect(stage.getByRole('button', { name: 'Read aloud: on' })).toBeVisible();
    } else {
      await stage.getByRole('button', { name: 'Read aloud: off' }).click();
    }

    await page.evaluate(() => { (window as SpeechWindow).recordedSpeech.length = 0; });
    await stage.getByRole('button', { name: 'Next', exact: true }).click();
    const reading = /^Line 2 of 2\. The fraction\b/i;
    const recordedSpeech = () => page.evaluate(() => (window as SpeechWindow).recordedSpeech);
    await expect.poll(recordedSpeech).toEqual([expect.stringMatching(reading)]);
    await expect(page.getByTestId('live-polite')).toHaveText(reading);

    // This screen's override must not change the preference elsewhere.
    if (selfVoicing) await stage.getByRole('button', { name: 'Read aloud: on' }).click();
    await stage.getByRole('button', { name: 'Leave', exact: true }).click();
    await page.evaluate(() => { (window as SpeechWindow).recordedSpeech.length = 0; });
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(page.getByTestId('live-polite')).toContainText('Keyboard shortcuts.');
    if (selfVoicing) {
      await expect.poll(recordedSpeech).toEqual([expect.stringMatching(/^Keyboard shortcuts\./)]);
    } else {
      expect(await recordedSpeech()).toEqual([]);
    }
  });
}
