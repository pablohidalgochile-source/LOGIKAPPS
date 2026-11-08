import AppKit
let folder=URL(fileURLWithPath:CommandLine.arguments[1])
try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
for base in [16,32,128,256,512] {
    for scale in [1,2] {
        let side=base*scale
        let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:side,pixelsHigh:side,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
        NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
        NSGraphicsContext.current!.cgContext.scaleBy(x:CGFloat(side)/1024,y:CGFloat(side)/1024)
        NSColor(srgbRed:0.075,green:0.105,blue:0.065,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:35,y:35,width:954,height:954),xRadius:215,yRadius:215).fill()
        let lime=NSColor(srgbRed:0.8,green:0.97,blue:0.46,alpha:1);lime.setStroke()
        let card=NSBezierPath(roundedRect:NSRect(x:195,y:295,width:640,height:430),xRadius:65,yRadius:65);card.lineWidth=32;card.stroke()
        let bar=NSBezierPath();bar.move(to:NSPoint(x:210,y:610));bar.line(to:NSPoint(x:820,y:610));bar.lineWidth=50;bar.stroke()
        lime.setFill();NSBezierPath(ovalIn:NSRect(x:570,y:190,width:270,height:270)).fill()
        NSColor(srgbRed:0.07,green:0.10,blue:0.05,alpha:1).setStroke()
        let tick=NSBezierPath();tick.move(to:NSPoint(x:625,y:325));tick.line(to:NSPoint(x:675,y:275));tick.line(to:NSPoint(x:775,y:365));tick.lineWidth=29;tick.lineCapStyle = .round;tick.lineJoinStyle = .round;tick.stroke()
        NSGraphicsContext.restoreGraphicsState()
        try rep.representation(using:.png,properties:[:])!.write(to:folder.appendingPathComponent("icon_\(base)x\(base)\(scale==2 ? "@2x" : "").png"))
    }
}
