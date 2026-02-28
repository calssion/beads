/**
 * 拼豆图纸生成器 — 主应用逻辑
 */
(function () {
  // ---- DOM 元素 ----
  const uploadArea   = document.getElementById('uploadArea');
  const fileInput    = document.getElementById('fileInput');
  const beadWidthEl  = document.getElementById('beadWidth');
  const cellSizeEl   = document.getElementById('cellSize');
  const algorithmEl  = document.getElementById('algorithm');
  const generateBtn  = document.getElementById('generateBtn');
  const previewSec   = document.getElementById('previewSection');
  const origCanvas   = document.getElementById('originalCanvas');
  const beadCanvas   = document.getElementById('beadCanvas');
  const hiddenCanvas = document.getElementById('hiddenCanvas');
  const colorSummary = document.getElementById('colorSummary');
  const downloadBtn  = document.getElementById('downloadBtn');

  let loadedImage = null; // 用户上传的 Image 对象

  // ---- 上传区交互 ----
  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  generateBtn.addEventListener('click', generate);

  // ---- 下载图纸 ----
  downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = '拼豆图纸.png';
    link.href = beadCanvas.toDataURL('image/png');
    link.click();
  });

  // ---- 加载图片 ----
  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        uploadArea.querySelector('p').textContent = `✅ ${file.name} (${img.width}×${img.height})`;
        generateBtn.disabled = false;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ---- 判断颜色亮度，决定文字用黑色还是白色 ----
  function getContrastTextColor(rgb) {
    // 使用相对亮度公式 (ITU-R BT.601)
    const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return luminance > 140 ? '#000000' : '#FFFFFF';
  }

  // ---- 生成图纸 ----
  function generate() {
    if (!loadedImage) return;

    const beadW = parseInt(beadWidthEl.value, 10) || 64;
    const CELL  = parseInt(cellSizeEl.value, 10) || 15;
    const algo  = algorithmEl.value;

    // 按比例计算珠子行数
    const aspect = loadedImage.height / loadedImage.width;
    const beadH  = Math.round(beadW * aspect);

    // 1. 缩放到珠子尺寸 → 获取像素数据
    const hCtx = hiddenCanvas.getContext('2d');
    hiddenCanvas.width  = beadW;
    hiddenCanvas.height = beadH;
    hCtx.drawImage(loadedImage, 0, 0, beadW, beadH);
    const imageData = hCtx.getImageData(0, 0, beadW, beadH);
    const pixels    = imageData.data; // Uint8ClampedArray [r,g,b,a, ...]

    // 2. 逐像素匹配调色板颜色
    const grid = [];       // 二维数组: grid[y][x] = paletteColor
    const colorCount = {}; // { colorId: count }

    for (let y = 0; y < beadH; y++) {
      const row = [];
      for (let x = 0; x < beadW; x++) {
        const i = (y * beadW + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        // 如果 alpha 很低，视为白色
        const a = pixels[i + 3];
        const targetRgb = a < 30 ? [255, 255, 255] : [r, g, b];

        const matched = matchColor(targetRgb, PALETTE, algo);
        row.push(matched);

        colorCount[matched.id] = (colorCount[matched.id] || 0) + 1;
      }
      grid.push(row);
    }

    // 3. 绘制缩略原图（固定最大宽度 320px）
    const thumbW = Math.min(beadW * CELL, 320);
    const thumbH = Math.round(thumbW * aspect);
    origCanvas.width  = thumbW;
    origCanvas.height = thumbH;
    const oCtx = origCanvas.getContext('2d');
    oCtx.imageSmoothingEnabled = true;
    oCtx.drawImage(loadedImage, 0, 0, thumbW, thumbH);

    // 4. 绘制拼豆图纸（每个像素 → CELL×CELL 正方形格子 + 居中色号文本）
    beadCanvas.width  = beadW * CELL;
    beadCanvas.height = beadH * CELL;
    const bCtx = beadCanvas.getContext('2d');

    // 根据格子大小动态计算字号（保证文字不溢出格子）
    const fontSize = Math.max(6, Math.floor(CELL * 0.52));
    bCtx.textAlign    = 'center';
    bCtx.textBaseline = 'middle';

    for (let y = 0; y < beadH; y++) {
      for (let x = 0; x < beadW; x++) {
        const color = grid[y][x];
        const px = x * CELL;
        const py = y * CELL;

        // 格子底色
        bCtx.fillStyle = color.hex;
        bCtx.fillRect(px, py, CELL, CELL);

        // 网格线
        bCtx.strokeStyle = 'rgba(0,0,0,0.2)';
        bCtx.lineWidth = 0.5;
        bCtx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);

        // 居中绘制色号文本，对比度自适应
        bCtx.fillStyle = getContrastTextColor(color.rgb);
        bCtx.font = `bold ${fontSize}px Arial, sans-serif`;
        bCtx.fillText(color.id, px + CELL / 2, py + CELL / 2);
      }
    }

    // 5. 颜色用量汇总
    const totalBeads = beadW * beadH;
    const sortedColors = Object.entries(colorCount)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const c = PALETTE.find((p) => p.id === id);
        return { ...c, count };
      });

    const tableRows = sortedColors
      .map(
        (c, i) =>
          `<tr>` +
          `<td>${i + 1}</td>` +
          `<td><span class="swatch-cell" style="background:${c.hex}"></span></td>` +
          `<td><strong>${c.id}</strong></td>` +
          `<td>${c.hex}</td>` +
          `<td>${c.count}</td>` +
          `<td>${((c.count / totalBeads) * 100).toFixed(1)}%</td>` +
          `</tr>`
      )
      .join('');

    colorSummary.innerHTML =
      `<h3>颜色用量统计（共 ${sortedColors.length} 种颜色，${totalBeads.toLocaleString()} 颗珠子）</h3>` +
      `<table class="stats-table">` +
      `<thead><tr>` +
      `<th>#</th><th>色块</th><th>色号</th><th>HEX</th><th>数量</th><th>占比</th>` +
      `</tr></thead>` +
      `<tbody>${tableRows}</tbody>` +
      `</table>` +
      '<div class="color-list">' +
      sortedColors
        .map(
          (c) =>
            `<span class="color-chip">` +
            `<span class="swatch" style="background:${c.hex}"></span>` +
            `${c.id}：${c.count} 颗` +
            `</span>`
        )
        .join('') +
      '</div>';

    previewSec.style.display = 'block';

    // 6. 图纸尺寸说明
    document.getElementById('beadInfo').textContent =
      `图纸尺寸：横向 ${beadW} 格 × 纵向 ${beadH} 格，共需 ${totalBeads.toLocaleString()} 颗豆子`;

    previewSec.scrollIntoView({ behavior: 'smooth' });
  }
})();
