// Flat front/back UV preview. Original PNG bytes are never edited for upload.
function drawSkin(canvas, image, variant = 'classic', back = false){
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if(!image) return
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.scale(canvas.width / 16, canvas.height / 32)
    const slim = variant === 'slim', arm = slim ? 3 : 4
    const modern = image.naturalHeight === 64
    const part = (sx, sy, w, h, dx, dy, mirror = false) => {
        ctx.save()
        ctx.translate(dx + (mirror ? w : 0), dy)
        if(mirror) ctx.scale(-1, 1)
        ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h)
        ctx.restore()
    }
    part(back ? 24 : 8, 8, 8, 8, 4, 0)
    part(back ? 32 : 20, 20, 8, 12, 4, 8)
    part(back ? 48 + arm : 44, 20, arm, 12, back ? 12 : 4 - arm, 8)
    part(modern ? (back ? 40 + arm : 36) : (back ? 48 + arm : 44), modern ? 52 : 20, arm, 12, back ? 4 - arm : 12, 8, !modern)
    part(back ? 12 : 4, 20, 4, 12, back ? 8 : 4, 20)
    part(modern ? (back ? 28 : 20) : (back ? 12 : 4), modern ? 52 : 20, 4, 12, back ? 4 : 8, 20, !modern)
    // Second layers, including the hat, are composited after the base skin.
    if(modern){
        part(back ? 32 : 20, 36, 8, 12, 4, 8)
        part(back ? 48 + arm : 44, 36, arm, 12, back ? 12 : 4 - arm, 8)
        part(back ? 56 + arm : 52, 52, arm, 12, back ? 4 - arm : 12, 8)
        part(back ? 12 : 4, 36, 4, 12, back ? 8 : 4, 20)
        part(back ? 12 : 4, 52, 4, 12, back ? 4 : 8, 20)
    }
    part(back ? 56 : 40, 8, 8, 8, 4, 0)
    ctx.restore()
}

function drawCape(canvas, image){
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if(!image) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, 1, 1, 10, 16, 0, 0, canvas.width, canvas.height)
}

module.exports = { drawSkin, drawCape }
