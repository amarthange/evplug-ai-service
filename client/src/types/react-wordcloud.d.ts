declare module 'react-wordcloud' {
  import { FC } from 'react';

  export interface Word {
    text: string;
    value: number;
  }

  export interface Options {
    colors?: string[];
    enableTooltip?: boolean;
    deterministic?: boolean;
    fontFamily?: string;
    fontSizes?: [number, number];
    fontStyle?: string;
    fontWeight?: string;
    padding?: number;
    rotations?: number;
    rotationAngles?: [number, number];
    scale?: 'linear' | 'log' | 'sqrt';
    spiral?: 'archimedean' | 'rectangular';
    transitionDuration?: number;
  }

  export interface ReactWordcloudProps {
    words: Word[];
    options?: Options;
    callbacks?: any;
    size?: [number, number];
  }

  const ReactWordcloud: FC<ReactWordcloudProps>;
  export default ReactWordcloud;
}
