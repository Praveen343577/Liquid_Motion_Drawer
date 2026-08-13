import { forwardRef } from "react";

interface LiquidFilterProps {
  id: string;
  width: number;
  height: number;
  blur: number;
  specularOpacity: number;
}

export interface LiquidFilterRefs {
  filterBlur: SVGFEGaussianBlurElement;
  displacementImage: SVGFEImageElement;
  displacementMap: SVGFEDisplacementMapElement;
  specularImage: SVGFEImageElement;
  specularAlpha: SVGFEFuncAElement;
}

export const LiquidFilter = forwardRef<LiquidFilterRefs, LiquidFilterProps>(
  ({ id, width, height, blur, specularOpacity }, ref) => {
    return (
      <svg
        className="glass-filter-svg"
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter
            id={id}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              ref={(el) => {
                if (ref && "current" in ref && ref.current) ref.current.filterBlur = el!;
                else if (typeof ref === "function" && el) {
                  // We require the object ref form for simplicity in the parent
                }
              }}
              in="SourceGraphic"
              stdDeviation={blur}
              result="blurred"
            />
            <feImage
              ref={(el) => {
                if (ref && "current" in ref && ref.current) ref.current.displacementImage = el!;
              }}
              href=""
              x="0"
              y="0"
              width={width}
              height={height}
              result="displacement_map"
              preserveAspectRatio="none"
            />
            <feDisplacementMap
              ref={(el) => {
                if (ref && "current" in ref && ref.current) ref.current.displacementMap = el!;
              }}
              in="blurred"
              in2="displacement_map"
              scale={50}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feColorMatrix
              in="displaced"
              type="saturate"
              values="1.3"
              result="displaced_saturated"
            />
            <feImage
              ref={(el) => {
                if (ref && "current" in ref && ref.current) ref.current.specularImage = el!;
              }}
              href=""
              x="0"
              y="0"
              width={width}
              height={height}
              result="specular_layer"
              preserveAspectRatio="none"
            />
            <feComponentTransfer in="specular_layer" result="specular_faded">
              <feFuncA
                ref={(el) => {
                  if (ref && "current" in ref && ref.current) ref.current.specularAlpha = el!;
                }}
                type="linear"
                slope={specularOpacity}
              />
            </feComponentTransfer>
            <feBlend in="specular_faded" in2="displaced_saturated" mode="screen" />
          </filter>
        </defs>
      </svg>
    );
  }
);
LiquidFilter.displayName = "LiquidFilter";
