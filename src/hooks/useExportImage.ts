import { useState, useCallback } from 'react';
import { toPng } from 'html-to-image';

interface UseExportImageOptions {
  fileName?: string;
  backgroundColor?: string;
}

export function useExportImage() {
  const [isExporting, setIsExporting] = useState(false);

  const exportAsImage = useCallback(
    async (elementHash: HTMLElement | null, options: UseExportImageOptions = {}) => {
      if (!elementHash) return;
      
      try {
        setIsExporting(true);
        
        // Let the state update propagate so spinners appear before taking snapshot
        await new Promise(resolve => setTimeout(resolve, 50));

        const { fileName = 'f1-rating-export.png', backgroundColor = '#0a0a0b' } = options;

        // Generate image using html-to-image exactly like ResultsDashboard handles its tables
        const dataUrl = await toPng(elementHash, {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor,
            width: elementHash.scrollWidth,
            height: elementHash.scrollHeight,
            filter: (node) => {
                // Don't include buttons marked with 'hide-on-export'
                if (node instanceof HTMLElement && node.classList.contains('hide-on-export')) {
                    return false;
                }
                return true;
            }
        });

        // Create download link
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();
        
      } catch (error) {
        console.error('Failed to export image:', error);
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return { exportAsImage, isExporting };
}
