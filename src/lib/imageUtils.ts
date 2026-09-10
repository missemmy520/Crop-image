/**
 * Splits an image into a grid of tiles
 */
export async function splitImage(
  sourceDataUrl: string,
  rows: number,
  cols: number
): Promise<{ dataUrl: string; row: number; col: number }[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tiles = [];
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Use Math.round and handle the last tile specifically to avoid subpixel gaps or "black borders"
          const startX = Math.round((c * img.width) / cols);
          const endX = c === cols - 1 ? img.width : Math.round(((c + 1) * img.width) / cols);
          const startY = Math.round((r * img.height) / rows);
          const endY = r === rows - 1 ? img.height : Math.round(((r + 1) * img.height) / rows);
          
          const width = endX - startX;
          const height = endY - startY;

          if (width <= 0 || height <= 0) continue;

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            // Ensure canvas is clean
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(
              img,
              startX,
              startY,
              width,
              height,
              0,
              0,
              width,
              height
            );
            tiles.push({
              id: `tile-${r}-${c}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              dataUrl: canvas.toDataURL("image/png"),
              row: r,
              col: c,
              isSelected: false
            });
          }
        }
      }
      resolve(tiles);
    };
    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}

/**
 * Splits an image into a grid based on custom horizontal and vertical line positions (0-100)
 */
export async function splitImageCustom(
  sourceDataUrl: string,
  horizontalLines: number[],
  verticalLines: number[]
): Promise<{ dataUrl: string; row: number; col: number }[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tiles = [];
      
      // Sort and add boundaries
      const hPoints = [0, ...[...horizontalLines].sort((a, b) => a - b), 100];
      const vPoints = [0, ...[...verticalLines].sort((a, b) => a - b), 100];
      
      for (let r = 0; r < hPoints.length - 1; r++) {
        for (let c = 0; c < vPoints.length - 1; c++) {
          const startX = Math.round((vPoints[c] * img.width) / 100);
          const endX = Math.round((vPoints[c + 1] * img.width) / 100);
          const startY = Math.round((hPoints[r] * img.height) / 100);
          const endY = Math.round((hPoints[r + 1] * img.height) / 100);
          
          const width = endX - startX;
          const height = endY - startY;

          if (width <= 0 || height <= 0) continue;

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(
              img,
              startX,
              startY,
              width,
              height,
              0,
              0,
              width,
              height
            );
            tiles.push({
              id: `custom-tile-${r}-${c}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              dataUrl: canvas.toDataURL("image/png"),
              row: r,
              col: c,
              isSelected: false
            });
          }
        }
      }
      resolve(tiles);
    };
    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}
export async function createComposite(
  tiles: string[],
  columns: number
): Promise<string> {
  if (tiles.length === 0) return "";

  return new Promise((resolve, reject) => {
    const images: HTMLImageElement[] = [];
    let loadedCount = 0;

    tiles.forEach((dataUrl, index) => {
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        loadedCount++;
        if (loadedCount === tiles.length) {
          const rows = Math.ceil(tiles.length / columns);
          
          // Use the first image's dimensions as the standard for all tiles
          // to ensure consistent proportions in the final grid.
          const tileWidth = images[0].width;
          const tileHeight = images[0].height;

          const canvas = document.createElement("canvas");
          canvas.width = tileWidth * columns;
          canvas.height = tileHeight * rows;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            images.forEach((img, i) => {
              const r = Math.floor(i / columns);
              const c = i % columns;
              // Draw each image scaled to the standard tile size
              ctx.drawImage(
                img, 
                c * tileWidth, 
                r * tileHeight, 
                tileWidth, 
                tileHeight
              );
            });
            resolve(canvas.toDataURL("image/png"));
          }
        }
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  });
}

/**
 * Crops an image based on provided coordinates and dimensions
 */
export async function cropImage(
  sourceDataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      } else {
        reject(new Error("Could not get canvas context"));
      }
    };
    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}
