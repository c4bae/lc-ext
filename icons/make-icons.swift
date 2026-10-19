import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Regenerate the extension icons from icon-source.png (macOS, no dependencies):
//   swift icons/make-icons.swift icons/icon-source.png icons
let args = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil)!
let art = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let outDir = args[2]

// Output px of extra stroke radius per size: thin line art vanishes at 16 px.
let sizes: [(Int, CGFloat)] = [(16, 0.45), (48, 0.3), (128, 0)]
let scale = 8 // supersample, then downscale
let space = CGColorSpace(name: CGColorSpace.sRGB)!

func context(_ size: Int) -> CGContext {
  CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

for (size, dilate) in sizes {
  let big = size * scale
  let ctx = context(big)
  let s = CGFloat(big)

  // White rounded square with a faint border so it reads on white pages too.
  let inset = s * 0.02
  let rect = CGRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
  let path = CGPath(roundedRect: rect, cornerWidth: s * 0.22, cornerHeight: s * 0.22, transform: nil)
  ctx.addPath(path)
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fillPath()
  ctx.addPath(path)
  ctx.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.12))
  ctx.setLineWidth(s * 0.02)
  ctx.strokePath()

  // Line art, padded, drawn repeatedly around a small circle to thicken strokes.
  let pad = s * 0.17
  let artRect = CGRect(x: pad, y: pad, width: s - 2 * pad, height: s - 2 * pad)
  ctx.interpolationQuality = .high
  ctx.draw(art, in: artRect)
  let r = dilate * CGFloat(scale)
  if r > 0 {
    for ring in [r / 2, r] {
      for i in 0..<24 {
        let a = CGFloat(i) / 24 * 2 * .pi
        ctx.draw(art, in: artRect.offsetBy(dx: ring * cos(a), dy: ring * sin(a)))
      }
    }
  }

  let small = context(size)
  small.interpolationQuality = .high
  small.draw(ctx.makeImage()!, in: CGRect(x: 0, y: 0, width: size, height: size))

  let url = URL(fileURLWithPath: "\(outDir)/icon\(size).png") as CFURL
  let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, small.makeImage()!, nil)
  CGImageDestinationFinalize(dest)
}
