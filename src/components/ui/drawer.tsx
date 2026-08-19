import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "@/components/icons/solar";

import { cn } from "@/lib/utils";

const Drawer = ({
  shouldScaleBackground = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    hideClose?: boolean;
    hideHandle?: boolean;
    desktopVariant?: "dialog" | "panel";
  }
>(({ className, children, hideClose, hideHandle, desktopVariant = "dialog", ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      data-zc-drawer-variant={desktopVariant}
      className={cn(
        // zc-noir-surface: every bottom sheet is anchored to the foot of the
        // screen, where the page's own gradient has already faded to black.
        // This gives each one its own sweep instead. Inert outside Rose Noir.
        "zc-noir-surface fixed inset-x-0 bottom-0 z-50 flex h-auto flex-col rounded-t-[16px] border-t border-border/50 bg-background outline-none",
        className,
      )}
      {...props}
    >
      {(!hideHandle || !hideClose) && (
        <div className="relative flex h-7 w-full shrink-0 items-center justify-center sm:h-9">
          {!hideHandle && <div className="h-1 w-10 rounded-full bg-border sm:w-12 md:hidden" />}
          {!hideClose && (
            <DrawerPrimitive.Close className="absolute right-3 top-1/2 z-50 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full transition-colors hover:bg-muted sm:right-4">
              <X className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
              <span className="sr-only">Close</span>
            </DrawerPrimitive.Close>
          )}
        </div>
      )}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1 px-4 pb-3 pt-1 text-left sm:gap-1.5 sm:p-4", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-[17px] font-semibold leading-none tracking-tight sm:text-lg", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
