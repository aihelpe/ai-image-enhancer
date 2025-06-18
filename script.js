document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const fileListDiv = document.getElementById('fileList');
  const uploadBox = document.getElementById('uploadBox');
  const spinner = document.getElementById('spinner');
  const pdfCanvas = document.getElementById('pdfCanvas');
  const pdfCtx = pdfCanvas.getContext('2d');
  const pageRangeInput = document.getElementById('pageRange');
  const toolCards = document.querySelectorAll('.tool-card[data-action]');

  let selectedFiles = [];

  function renderFileList() {
    fileListDiv.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.dataset.filename = file.name;

      const span = document.createElement('span');
      span.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

      const btn = document.createElement('button');
      btn.textContent = '❌';
      btn.className = 'remove-btn';
      btn.onclick = () => {
        selectedFiles.splice(idx, 1);
        renderFileList();
        updateToolStates();
      };

      item.append(span, btn);
      fileListDiv.append(item);
    });
    initSortable();
  }

  function initSortable() {
    if (Sortable.instances.length) return;
    Sortable.create(fileListDiv, {
      animation: 150,
      onEnd: () => {
        const reordered = Array.from(fileListDiv.children).map(div =>
          selectedFiles.find(f => f.name === div.dataset.filename)
        );
        selectedFiles = reordered;
        updateToolStates();
      }
    });
  }

  function handleFiles(fileList) {
    const pdfs = Array.from(fileList).filter(f => f.type === 'application/pdf');
    const existingNames = new Set(selectedFiles.map(f => f.name));
    const unique = pdfs.filter(f => !existingNames.has(f.name));
    if (!unique.length) return;
    selectedFiles = [...selectedFiles, ...unique];
    renderFileList();
    updateToolStates();
    renderPreview(selectedFiles[0]);
  }

  function renderPreview(file) {
    if (!file) return;
    spinner.style.display = 'block';
    pdfCanvas.style.display = 'none';

    const reader = new FileReader();
    reader.onload = function() {
      const u8 = new Uint8Array(this.result);
      pdfjsLib.getDocument(u8).promise.then(pdf =>
        pdf.getPage(1).then(page => {
          const vp = page.getViewport({ scale: 1.5 });
          pdfCanvas.width = vp.width;
          pdfCanvas.height = vp.height;
          return page.render({ canvasContext: pdfCtx, viewport: vp }).promise;
        })
      ).then(() => {
        spinner.style.display = 'none';
        pdfCanvas.style.display = 'block';
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function parsePageRange(input, total) {
    if (!input.trim()) return [...Array(total).keys()];
    const set = new Set();
    input.split(',').forEach(seg => {
      const parts = seg.split('-').map(n => parseInt(n.trim(), 10) - 1);
      const start = parts[0];
      const end = parts[1] >= start ? parts[1] : start;
      for (let i = Math.max(0, start); i <= Math.min(end, total - 1); i++) set.add(i);
    });
    return [...set].sort();
  }

  function updateToolStates() {
    toolCards.forEach(card => {
      const action = card.dataset.action;
      const len = selectedFiles.length;
      const disabled = (action === 'merge' && len < 2) ||
          ((action === 'split' || action === 'compress') && len !== 1);
      card.classList.toggle('disabled', disabled);
    });
  }

  toolCards.forEach(card => {
    card.addEventListener('click', async () => {
      if (card.classList.contains('disabled')) return;
      const action = card.dataset.action;
      spinner.style.display = 'block';

      try {
        if (action === 'compress') {
          const data = await selectedFiles[0].arrayBuffer();
          const result = await compressPDF(data);
          downloadBlob(result, 'compressed.pdf');

        } else if (action === 'merge') {
          const buffers = await Promise.all(selectedFiles.map(f => f.arrayBuffer()));
          const mergedDoc = await PDFLib.PDFDocument.create();

          for (const buf of buffers) {
            const doc = await PDFLib.PDFDocument.load(buf);
            const indices = parsePageRange(pageRangeInput.value, doc.getPageCount());
            const pages = await mergedDoc.copyPages(doc, indices);
            pages.forEach(p => mergedDoc.addPage(p));
          }
          const mergedBytes = await mergedDoc.save();
          downloadBlob(mergedBytes, 'merged.pdf');

        } else if (action === 'split') {
          const buf = await selectedFiles[0].arrayBuffer();
          const doc = await PDFLib.PDFDocument.load(buf);
          const indices = parsePageRange(pageRangeInput.value, doc.getPageCount());

          for (const idx of indices) {
            const newDoc = await PDFLib.PDFDocument.create();
            const [pg] = await newDoc.copyPages(doc, [idx]);
            newDoc.addPage(pg);
            const bytes = await newDoc.save();
            downloadBlob(bytes, `page-${idx + 1}.pdf`);
          }
        }

      } catch (error) {
        console.error(error);
        alert('❌ Something went wrong.');
      } finally {
        spinner.style.display = 'none';
      }
    });
  });

  fileInput.addEventListener('change', e => handleFiles(e.target.files));
  uploadBox.addEventListener('dragover', e => { e.preventDefault(); uploadBox.style.borderColor = '#00c853'; });
  uploadBox.addEventListener('dragleave', () => { uploadBox.style.borderColor = '#bbb'; });
  uploadBox.addEventListener('drop', e => { e.preventDefault(); uploadBox.style.borderColor = '#bbb'; handleFiles(e.dataTransfer.files); });
  document.querySelector('.browse-btn').addEventListener('click', () => fileInput.click());

  // PDF logic
  async function compressPDF(bytes) { /*... as above ...*/ }
  async function mergePDFs(buffers) { /*...not used directly*/ }
  async function splitPDF(bytes) { /*...not used directly*/ }
  function downloadBlob(bytes, name) { /*... as above ...*/ }
});
//Rebind-On-State-Change Strategy
function bindAuthButtons() {
  const loginBtn = document.getElementById('btnLogin');
  const signupBtn = document.getElementById('btnSignup');

  if (loginBtn) loginBtn.onclick = () => { isLogin = true; openAuth(); };
  if (signupBtn) signupBtn.onclick = () => { isLogin = false; openAuth(); };
}

firebase.auth().onAuthStateChanged(user => {
  const wrap = document.getElementById('authActions');
  if (user) {
    wrap.innerHTML = `
      <span>Hi, ${user.email}</span>
      <button id="logoutBtn">Logout</button>
    `;
    document.getElementById('logoutBtn').onclick = () => firebase.auth().signOut();
  } else {
    wrap.innerHTML = `
      <button id="btnLogin">Login</button>
      <button id="btnSignup" class="primary">Sign Up</button>
    `;
    bindAuthButtons();
  }
});
