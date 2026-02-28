// pages/index/index.js
const PALETTE = require('../../utils/palette');
const { matchColor, getContrastTextColor } = require('../../utils/colorMatch');

Page({
  data: {
    imagePath: '',
    imageInfo: '',
    beadWidth: 64,
    cellSize: 25,
    algorithmIndex: 0,
    algorithms: [
      { name: 'CIEDE2000（推荐）', value: 'ciede2000' },
      { name: 'RGB 欧几里得距离', value: 'euclidean' },
      { name: 'RGB 加权欧几里得距离', value: 'weighted' },
    ],
    generating: false,
    generated: false,
    beadW: 0,
    beadH: 0,
    totalBeads: '',
    canvasWidth: 0,
    canvasHeight: 0,
    hiddenW: 1,
    hiddenH: 1,
    statsCanvasW: 1,
    statsCanvasH: 1,
    colorStats: [],
    beadImagePath: '',
  },

  // 上次生成的数据（供导出用）
  _sortedColors: null,
  _totalBeads: 0,
  _beadW: 0,
  _beadH: 0,

  /* ============================
   *  事件处理
   * ============================ */

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.getImageInfo({
          src: tempPath,
          success: (info) => {
            this.setData({
              imagePath: tempPath,
              imageInfo: `${info.width}×${info.height}`,
              generated: false,
            });
          },
        });
      },
    });
  },

  onBeadWidthChange(e) {
    this.setData({ beadWidth: parseInt(e.detail.value, 10) || 64 });
  },

  onCellSizeChange(e) {
    this.setData({ cellSize: parseInt(e.detail.value, 10) || 25 });
  },

  onAlgorithmChange(e) {
    this.setData({ algorithmIndex: parseInt(e.detail.value, 10) });
  },

  /* ============================
   *  生成图纸
   * ============================ */

  async generate() {
    if (!this.data.imagePath || this.data.generating) return;
    this.setData({ generating: true });

    // 允许 UI 更新
    await this._sleep(50);

    try {
      await this._doGenerate();
    } catch (err) {
      console.error('生成失败', err);
      wx.showToast({ title: '生成失败', icon: 'error' });
    }

    this.setData({ generating: false });
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async _doGenerate() {
    const beadW = this.data.beadWidth;
    const CELL  = this.data.cellSize;
    const algo  = this.data.algorithms[this.data.algorithmIndex].value;

    // 1. 获取图片信息并计算珠子行数
    const imgInfo = await this._getImageInfo(this.data.imagePath);
    const aspect  = imgInfo.height / imgInfo.width;
    const beadH   = Math.round(beadW * aspect);

    // 2. 在隐藏 canvas 中缩放并获取像素数据
    this.setData({ hiddenW: beadW, hiddenH: beadH });
    await this._sleep(50); // 等待 canvas 尺寸更新

    const pixels = await this._getPixelData(beadW, beadH);

    // 3. 逐像素匹配调色板颜色
    const grid = [];
    const colorCount = {};

    for (let y = 0; y < beadH; y++) {
      const row = [];
      for (let x = 0; x < beadW; x++) {
        const i = (y * beadW + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        const targetRgb = a < 30 ? [255, 255, 255] : [r, g, b];

        const matched = matchColor(targetRgb, PALETTE, algo);
        row.push(matched);
        colorCount[matched.id] = (colorCount[matched.id] || 0) + 1;
      }
      grid.push(row);
    }

    // 4. 计算坐标区+网格的 canvas 尺寸
    const labelFontSize = Math.max(8, Math.floor(CELL * 0.48));
    const MARGIN = Math.max(CELL, labelFontSize * 2.5);
    const canvasWidth  = beadW * CELL + MARGIN * 2;
    const canvasHeight = beadH * CELL + MARGIN * 2;

    // 5. 统计
    const totalBeads = beadW * beadH;
    const sortedColors = Object.entries(colorCount)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const c = PALETTE.find(p => p.id === id);
        return { ...c, count, pct: ((count / totalBeads) * 100).toFixed(1) + '%' };
      });

    this._sortedColors = sortedColors;
    this._totalBeads = totalBeads;
    this._beadW = beadW;
    this._beadH = beadH;

    this.setData({
      beadW,
      beadH,
      totalBeads: totalBeads.toLocaleString(),
      canvasWidth,
      canvasHeight,
      colorStats: sortedColors,
      generated: true,
    });

    // 等待 canvas 节点就绪后再绘制
    await this._sleep(100);
    await this._drawBeadCanvas(grid, beadW, beadH, CELL, MARGIN, labelFontSize);

    // 将 canvas 转为图片显示在 scroll-view 中
    const beadCanvas = await this._getCanvas('beadCanvas');
    const beadTempPath = await this._canvasToTemp(beadCanvas);
    this.setData({ beadImagePath: beadTempPath });

    wx.showToast({ title: '生成完成', icon: 'success' });
  },

  /* ============================
   *  Canvas 绘制
   * ============================ */

  async _drawBeadCanvas(grid, beadW, beadH, CELL, MARGIN, labelFontSize) {
    const canvas = await this._getCanvas('beadCanvas');
    const ctx = canvas.getContext('2d');

    const w = this.data.canvasWidth;
    const h = this.data.canvasHeight;
    canvas.width = w;
    canvas.height = h;

    // 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // 色号字号
    const fontSize = Math.max(6, Math.floor(CELL * 0.52));

    // 绘制网格
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < beadH; y++) {
      for (let x = 0; x < beadW; x++) {
        const color = grid[y][x];
        const px = MARGIN + x * CELL;
        const py = MARGIN + y * CELL;

        ctx.fillStyle = color.hex;
        ctx.fillRect(px, py, CELL, CELL);

        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);

        ctx.fillStyle = getContrastTextColor(color.rgb);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillText(color.id, px + CELL / 2, py + CELL / 2);
      }
    }

    // 绘制坐标标签
    ctx.fillStyle = '#333';
    ctx.font = `${labelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let x = 0; x < beadW; x++) {
      const cx = MARGIN + x * CELL + CELL / 2;
      ctx.fillText(String(x + 1), cx, MARGIN / 2);
      ctx.fillText(String(x + 1), cx, MARGIN + beadH * CELL + MARGIN / 2);
    }
    for (let y = 0; y < beadH; y++) {
      const cy = MARGIN + y * CELL + CELL / 2;
      ctx.fillText(String(y + 1), MARGIN / 2, cy);
      ctx.fillText(String(y + 1), MARGIN + beadW * CELL + MARGIN / 2, cy);
    }
  },

  /* ============================
   *  像素数据提取
   * ============================ */

  _getImageInfo(src) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({ src, success: resolve, fail: reject });
    });
  },

  async _getPixelData(beadW, beadH) {
    const canvas = await this._getCanvas('hiddenCanvas');
    canvas.width = beadW;
    canvas.height = beadH;
    const ctx = canvas.getContext('2d');

    const img = canvas.createImage();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = this.data.imagePath;
    });

    ctx.drawImage(img, 0, 0, beadW, beadH);
    const imageData = ctx.getImageData(0, 0, beadW, beadH);
    return imageData.data;
  },

  _getCanvas(id) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#${id}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            resolve(res[0].node);
          } else {
            reject(new Error(`Canvas #${id} not found`));
          }
        });
    });
  },

  /* ============================
   *  保存图纸到相册
   * ============================ */

  async saveBeadImage() {
    try {
      let tempPath = this.data.beadImagePath;
      if (!tempPath) {
        const canvas = await this._getCanvas('beadCanvas');
        tempPath = await this._canvasToTemp(canvas);
      }
      await this._saveToAlbum(tempPath);
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      console.error(err);
      if (err.errMsg && err.errMsg.includes('auth deny')) {
        wx.showModal({ title: '提示', content: '请在设置中允许保存到相册' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'error' });
      }
    }
  },

  /* ============================
   *  保存统计图到相册
   * ============================ */

  async saveStatsImage() {
    const colors = this._sortedColors;
    if (!colors || colors.length === 0) return;

    const ROW_H = 28;
    const COL_WIDTHS = [50, 40, 60, 90, 70, 70];
    const TABLE_W = COL_WIDTHS.reduce((s, w) => s + w, 0);
    const HEADER_H = 36;
    const TITLE_H = 40;
    const PADDING = 16;
    const TABLE_H = HEADER_H + colors.length * ROW_H;
    const canvasW = TABLE_W + PADDING * 2;
    const canvasH = TITLE_H + TABLE_H + PADDING * 2;

    this.setData({ statsCanvasW: canvasW, statsCanvasH: canvasH });
    await this._sleep(100);

    try {
      const canvas = await this._getCanvas('statsCanvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');

      // 背景
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // 标题
      ctx.fillStyle = '#333';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `颜色用量统计（${colors.length} 种，${this._totalBeads} 颗，${this._beadW}×${this._beadH}）`,
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
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let hx = ox;
      headers.forEach((h, i) => {
        ctx.fillText(h, hx + COL_WIDTHS[i] / 2, oy + HEADER_H / 2);
        hx += COL_WIDTHS[i];
      });

      // 数据行
      ctx.font = '12px Arial';
      colors.forEach((clr, i) => {
        const ry = oy + HEADER_H + i * ROW_H;
        if (i % 2 === 1) {
          ctx.fillStyle = '#fafafa';
          ctx.fillRect(ox, ry, TABLE_W, ROW_H);
        }
        ctx.strokeStyle = '#e5e5e5';
        ctx.strokeRect(ox, ry, TABLE_W, ROW_H);

        let cx = ox;
        const cy = ry + ROW_H / 2;

        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), cx + COL_WIDTHS[0] / 2, cy);
        cx += COL_WIDTHS[0];

        const swatchSize = 16;
        ctx.fillStyle = clr.hex;
        ctx.fillRect(cx + (COL_WIDTHS[1] - swatchSize) / 2, cy - swatchSize / 2, swatchSize, swatchSize);
        ctx.strokeStyle = '#ccc';
        ctx.strokeRect(cx + (COL_WIDTHS[1] - swatchSize) / 2, cy - swatchSize / 2, swatchSize, swatchSize);
        cx += COL_WIDTHS[1];

        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(clr.id, cx + COL_WIDTHS[2] / 2, cy);
        cx += COL_WIDTHS[2];

        ctx.font = '12px Arial';
        ctx.fillText(clr.hex, cx + COL_WIDTHS[3] / 2, cy);
        cx += COL_WIDTHS[3];

        ctx.fillText(String(clr.count), cx + COL_WIDTHS[4] / 2, cy);
        cx += COL_WIDTHS[4];

        ctx.fillText(clr.pct, cx + COL_WIDTHS[5] / 2, cy);
      });

      const tempPath = await this._canvasToTemp(canvas);
      await this._saveToAlbum(tempPath);
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'error' });
    }
  },

  /* ============================
   *  工具函数
   * ============================ */

  _canvasToTemp(canvas) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        quality: 1,
        success: res => resolve(res.tempFilePath),
        fail: reject,
      });
    });
  },

  _saveToAlbum(tempPath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: resolve,
        fail: reject,
      });
    });
  },
});
