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
  const downloadBtn        = document.getElementById('downloadBtn');
  const downloadCsvBtn      = document.getElementById('downloadCsvBtn');
  const downloadStatsImgBtn = document.getElementById('downloadStatsImgBtn');

  let loadedImage = null; // 用户上传的 Image 对象
  let lastSortedColors = null; // 保存最后一次结果供导出用
  let lastTotalBeads = 0;
  let lastBeadW = 0;
  let lastBeadH = 0;

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

  // ---- 导出 CSV ----
  downloadCsvBtn.addEventListener('click', () => {
    if (!lastSortedColors) return;
    const BOM = '\uFEFF'; // Excel UTF-8 BOM
    const header = '序号,色号,HEX,RGB,数量,占比';
    const rows = lastSortedColors.map((c, i) =>
      `${i + 1},${c.id},${c.hex},"rgb(${c.rgb.join(',')})",${c.count},${((c.count / lastTotalBeads) * 100).toFixed(1)}%`
    );
    const summary = `\n汇总,,,,${lastTotalBeads},100%\n图纸尺寸,横${lastBeadW}格 x 纵${lastBeadH}格,,颜色种数,${lastSortedColors.length},`;
    const csv = BOM + header + '\n' + rows.join('\n') + summary;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = '拼豆颜色统计.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  });

  // ---- 导出统计图 PNG ----
  downloadStatsImgBtn.addEventListener('click', () => {
    if (!lastSortedColors) return;
    const colors = lastSortedColors;
    const ROW_H = 28;
    const COL_WIDTHS = [50, 40, 60, 90, 70, 70]; // #, 色块, 色号, HEX, 数量, 占比
    const TABLE_W = COL_WIDTHS.reduce((s, w) => s + w, 0);
    const HEADER_H = 36;
    const TITLE_H = 40;
    const PADDING = 16;
    const TABLE_H = HEADER_H + colors.length * ROW_H;
    const canvasW = TABLE_W + PADDING * 2;
    const canvasH = TITLE_H + TABLE_H + PADDING * 2;

    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    const ctx = c.getContext('2d');

    // 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 标题
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `颜色用量统计（${colors.length} 种，${lastTotalBeads.toLocaleString()} 颗，${lastBeadW}×${lastBeadH}）`,
      PADDING, TITLE_H / 2
    );

    const ox = PADDING;
    const oy = TITLE_H;

    // 表头
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(ox, oy, TABLE_W, HEADER_H);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, TABLE_W, HEADER_H);

    const headers = ['#', '色块', '色号', 'HEX', '数量', '占比'];
    ctx.fillStyle = '#333';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let hx = ox;
    headers.forEach((h, i) => {
      ctx.fillText(h, hx + COL_WIDTHS[i] / 2, oy + HEADER_H / 2);
      hx += COL_WIDTHS[i];
    });

    // 数据行
    ctx.font = '12px Arial, sans-serif';
    colors.forEach((clr, i) => {
      const ry = oy + HEADER_H + i * ROW_H;
      // 斑马纹背景
      if (i % 2 === 1) {
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(ox, ry, TABLE_W, ROW_H);
      }
      ctx.strokeStyle = '#e5e5e5';
      ctx.strokeRect(ox, ry, TABLE_W, ROW_H);

      let cx = ox;
      const cy = ry + ROW_H / 2;

      // #
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cx + COL_WIDTHS[0] / 2, cy);
      cx += COL_WIDTHS[0];

      // 色块
      const swatchSize = 16;
      ctx.fillStyle = clr.hex;
      ctx.fillRect(cx + (COL_WIDTHS[1] - swatchSize) / 2, cy - swatchSize / 2, swatchSize, swatchSize);
      ctx.strokeStyle = '#ccc';
      ctx.strokeRect(cx + (COL_WIDTHS[1] - swatchSize) / 2, cy - swatchSize / 2, swatchSize, swatchSize);
      cx += COL_WIDTHS[1];

      // 色号
      ctx.fillStyle = '#333';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillText(clr.id, cx + COL_WIDTHS[2] / 2, cy);
      cx += COL_WIDTHS[2];

      // HEX
      ctx.font = '12px Arial, sans-serif';
      ctx.fillText(clr.hex, cx + COL_WIDTHS[3] / 2, cy);
      cx += COL_WIDTHS[3];

      // 数量
      ctx.fillText(String(clr.count), cx + COL_WIDTHS[4] / 2, cy);
      cx += COL_WIDTHS[4];

      // 占比
      ctx.fillText(((clr.count / lastTotalBeads) * 100).toFixed(1) + '%', cx + COL_WIDTHS[5] / 2, cy);
    });

    const link = document.createElement('a');
    link.download = '拼豆颜色统计.png';
    link.href = c.toDataURL('image/png');
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
        const preview = document.getElementById('uploadPreview');
        preview.src = e.target.result;
        preview.style.display = 'block';
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

    // 4. 绘制拼豆图纸（每个像素 → CELL×CELL 正方形格子 + 居中色号文本 + 坐标轴）
    // 坐标标签区域大小
    const labelFontSize = Math.max(8, Math.floor(CELL * 0.48));
    const MARGIN = Math.max(CELL, labelFontSize * 2.5); // 坐标标签留白

    beadCanvas.width  = beadW * CELL + MARGIN * 2; // 左右各留 MARGIN
    beadCanvas.height = beadH * CELL + MARGIN * 2; // 上下各留 MARGIN
    const bCtx = beadCanvas.getContext('2d');

    // 背景填白
    bCtx.fillStyle = '#FFFFFF';
    bCtx.fillRect(0, 0, beadCanvas.width, beadCanvas.height);

    // 根据格子大小动态计算色号字号
    const fontSize = Math.max(6, Math.floor(CELL * 0.52));

    // ---- 绘制网格内容 ----
    bCtx.textAlign    = 'center';
    bCtx.textBaseline = 'middle';

    for (let y = 0; y < beadH; y++) {
      for (let x = 0; x < beadW; x++) {
        const color = grid[y][x];
        const px = MARGIN + x * CELL;
        const py = MARGIN + y * CELL;

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

    // ---- 绘制坐标标签 ----
    bCtx.fillStyle = '#333';
    bCtx.font = `${labelFontSize}px Arial, sans-serif`;
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';

    // 列号（上方 + 下方）
    for (let x = 0; x < beadW; x++) {
      const cx = MARGIN + x * CELL + CELL / 2;
      bCtx.fillText(String(x + 1), cx, MARGIN / 2);                         // 上
      bCtx.fillText(String(x + 1), cx, MARGIN + beadH * CELL + MARGIN / 2); // 下
    }

    // 行号（左侧 + 右侧）
    bCtx.textAlign = 'center';
    for (let y = 0; y < beadH; y++) {
      const cy = MARGIN + y * CELL + CELL / 2;
      bCtx.fillText(String(y + 1), MARGIN / 2, cy);                         // 左
      bCtx.fillText(String(y + 1), MARGIN + beadW * CELL + MARGIN / 2, cy); // 右
    }

    // 5. 颜色用量汇总
    const totalBeads = beadW * beadH;
    const sortedColors = Object.entries(colorCount)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const c = PALETTE.find((p) => p.id === id);
        return { ...c, count };
      });

    // 保存结果供导出使用
    lastSortedColors = sortedColors;
    lastTotalBeads = totalBeads;
    lastBeadW = beadW;
    lastBeadH = beadH;

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

    // 6. 生成缩略图
    const thumbEl = document.getElementById('beadThumbnail');
    thumbEl.src = beadCanvas.toDataURL('image/png');
    thumbEl.style.display = 'block';

    // 7. 图纸尺寸说明
    document.getElementById('beadInfo').textContent =
      `图纸尺寸：横向 ${beadW} 格 × 纵向 ${beadH} 格，共需 ${totalBeads.toLocaleString()} 颗豆子`;

    previewSec.scrollIntoView({ behavior: 'smooth' });
  }
})();
