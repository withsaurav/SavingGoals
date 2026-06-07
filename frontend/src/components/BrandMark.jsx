import { Leaf } from "lucide-react";
import { brand } from "@/brand.config";

/**
 * BrandMark: renders either your uploaded logo image OR the default leaf icon.
 * Size variants: "sm" | "md" | "lg"
 */
export function BrandMark({ size = "md", className = "" }) {
  const dims = {
    sm: "w-8 h-8",
    md: "w-9 h-9",
    lg: "w-10 h-10",
  }[size];

  const iconSize = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-5 h-5",
  }[size];

  if (brand.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={`${brand.name} logo`}
        className={`${dims} rounded-full object-cover ${className}`}
        data-testid="brand-logo-img"
      />
    );
  }

  return (
    <div
      className={`${dims} rounded-full bg-moss flex items-center justify-center ${className}`}
      data-testid="brand-logo-fallback"
    >
      <Leaf className={`${iconSize} text-white`} />
    </div>
  );
}

/**
 * BrandMarkOnDark: alternate styling for dark backgrounds (login hero).
 */
export function BrandMarkOnDark({ className = "" }) {
  if (brand.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={`${brand.name} logo`}
        className={`w-10 h-10 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`w-10 h-10 rounded-full bg-white/15 flex items-center justify-center ${className}`}>
      <Leaf className="w-5 h-5" />
    </div>
  );
}
