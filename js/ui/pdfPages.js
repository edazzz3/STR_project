// Модал выбора страницы PDF при загрузке.
export function createPdfPagesModal() {
  const modal = document.getElementById('pdfPagesModal');
  const listEl = document.getElementById('pdfPagesList');
  const backdrop = modal.querySelector('.modal-backdrop');
  const btnCancel = document.getElementById('pdfPagesCancel');
  let resolveFn = null;

  function open(pageCount) {
    listEl.innerHTML = '';
    modal.hidden = false;

    for (let i = 1; i <= pageCount; i++) {
      const row = document.createElement('label');
      row.className = 'modal-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = i;
      cb.checked = true;
      row.append(cb, document.createTextNode(` Лист ${i}`));
      listEl.appendChild(row);
    }

    return new Promise((resolve) => { resolveFn = resolve; });
  }

  function close(result) {
    modal.hidden = true;
    const r = resolveFn; resolveFn = null;
    r && r(result);
  }

  document.getElementById('pdfPagesOk').addEventListener('click', () => {
    const pages = [...listEl.querySelectorAll('input[type=checkbox]')]
      .filter(cb => cb.checked)
      .map(cb => +cb.value);
    if (!pages.length) return;
    close(pages);
  });

  btnCancel.addEventListener('click', () => close(null));
  backdrop.addEventListener('click', () => close(null));

  return { open };
}