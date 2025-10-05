import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const Card = ({ className, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] p-6 shadow-sm backdrop-blur",
        className
      )}
      {...props}
    />
  );
};

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("mb-4 flex items-center justify-between gap-4", className)} {...props} />;
};

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
};

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => {
  return <p className={cn("text-sm text-white/60", className)} {...props} />;
};

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("space-y-4", className)} {...props} />;
};
