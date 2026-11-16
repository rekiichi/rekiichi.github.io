// 赤シート方式の答え表示。答えの帯をタップすると表示、もう一度タップで隠す。
// [data-sheet-toggle] のボタンで、ページ内の答えをまとめて表示・非表示にする。

function setRevealed(button: HTMLElement, revealed: boolean): void {
  button.setAttribute('aria-pressed', String(revealed));
  if (revealed) button.removeAttribute('aria-label');
  else button.setAttribute('aria-label', '答えを表示');
  const detail = button.nextElementSibling;
  if (detail instanceof HTMLElement && detail.classList.contains('qa-detail')) detail.hidden = !revealed;
}

export function initRedSheet(): void {
  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('.sheet');
    if (!button) return;
    setRevealed(button, button.getAttribute('aria-pressed') !== 'true');
  });

  for (const toggle of document.querySelectorAll<HTMLButtonElement>('[data-sheet-toggle]')) {
    toggle.addEventListener('click', () => {
      const reveal = toggle.getAttribute('aria-pressed') !== 'true';
      for (const sheet of document.querySelectorAll<HTMLElement>('.sheet')) setRevealed(sheet, reveal);
      for (const t of document.querySelectorAll<HTMLButtonElement>('[data-sheet-toggle]')) {
        t.setAttribute('aria-pressed', String(reveal));
        t.textContent = reveal ? '答えをすべて隠す' : '答えをすべて表示';
      }
    });
  }
}
