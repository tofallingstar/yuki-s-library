export function createPlaceholderCover(title) {
    return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#6a82fb';
        ctx.fillRect(0, 0, 200, 300);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px sans-serif';
        const words = title.split(' ');
        let line = '';
        let y = 140;
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > 180 && n > 0) {
                ctx.fillText(line, 100, y);
                line = words[n] + ' ';
                y += 25;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 100, y);
        canvas.toBlob(resolve, 'image/png');
    });
}