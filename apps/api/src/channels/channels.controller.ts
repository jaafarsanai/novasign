import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

type Orientation = "landscape" | "portrait";

type Channel = {
  id: string;
  name: string;
  orientation: Orientation;
  createdAt: string;
  updatedAt?: string;

  // Editor state (in-memory for now)
  layoutId?: string;
  zones?: Record<string, any>;
  transition?: {
    enabled: boolean;
    type?: string;
    duration?: number;
    direction?: string;
  };
};

@Controller("/channels")
export class ChannelsController {
  private items: Channel[] = [];

  @Get()
  list(@Query("search") search?: string) {
    const s = (search || "").trim().toLowerCase();
    const items = !s ? this.items : this.items.filter(c => c.name.toLowerCase().includes(s));
    return { items };
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    const item = this.items.find(x => x.id === id) ?? null;
    return { item };
  }

  @Post()
  create(@Body() dto: { name: string; orientation: Orientation }) {
    const item: Channel = {
      id: crypto.randomUUID(),
      name: dto?.name ?? "Untitled",
      orientation: dto?.orientation ?? "landscape",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      layoutId: "default",
      zones: {},
      transition: { enabled: false, type: "slide", duration: 0.5, direction: "right" },
    };
    this.items.unshift(item);
    return { item };
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body()
    dto: Partial<Pick<Channel, "name" | "orientation" | "layoutId" | "zones" | "transition">>,
  ) {
    const idx = this.items.findIndex(x => x.id === id);
    if (idx === -1) throw new NotFoundException();

    const prev = this.items[idx];
    const next: Channel = {
      ...prev,
      ...dto,
      updatedAt: new Date().toISOString(),
    };

    this.items[idx] = next;
    return { item: next };
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    this.items = this.items.filter(x => x.id !== id);
    return { ok: true };
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string) {
    const src = this.items.find(x => x.id === id);
    if (!src) return { item: null };

    const copy: Channel = {
      ...src,
      id: crypto.randomUUID(),
      name: `${src.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.unshift(copy);
    return { item: copy };
  }
}

