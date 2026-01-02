declare module "qrcode.react" {
  import * as React from "react";

  export interface QRCodeProps extends React.SVGProps<SVGSVGElement> {
    value: string;
    size?: number;
    bgColor?: string;
    fgColor?: string;
    level?: "L" | "M" | "Q" | "H";
    includeMargin?: boolean;
  }

  export class QRCodeSVG extends React.Component<QRCodeProps> {}
}

