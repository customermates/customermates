import { Img } from "@react-email/components";

type Props = {
  alt?: string;
  className?: string;
  height?: number | string;
  src: string;
  width?: number | string;
};

export function XEmailImage({ alt, className, height, src, width }: Props) {
  return <Img alt={alt} className={className} height={height} src={src} width={width} />;
}
