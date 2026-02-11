import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "border-2 border-black px-6 py-3 font-bold uppercase tracking-wider transition-all duration-200 active:translate-y-0.5 rounded-none",
                    variant === 'primary'
                        ? "bg-black text-white hover:bg-white hover:text-black"
                        : "bg-white text-black hover:bg-black hover:text-white",
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button };
