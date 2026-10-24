import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PostMedia } from "../PostMedia";
import type { Post } from "@/types/post";

const urls = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"].map((f) => `https://storage.googleapis.com/b/${f}`);

const srcs = (container: HTMLElement) => [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));

describe("PostMedia", () => {
    it("loads only the current and next image of a timer carousel", () => {
        const post = { id: "p", imagen_urls: urls, thumbnail_url: "https://t/thumb.jpg" } as Post;
        const { container } = render(<PostMedia post={post} isPlaying={false} audioCurrentTime={0} />);
        expect(srcs(container)).toEqual(["https://t/thumb.jpg", urls[0], urls[1]]);
    });

    it("loads only the current and next image of a per-message post", () => {
        const post = {
            id: "p", image_style: "per-message", message_images: urls,
            audio_message_boundaries: urls.map((_, i) => ({ startTime: i * 10 })),
        } as unknown as Post;
        const { container } = render(<PostMedia post={post} isPlaying audioCurrentTime={25} />);
        expect(srcs(container)).toEqual([urls[2], urls[3]]);
    });

    it("loads every image lazily", () => {
        const post = { id: "p", imagen_urls: urls, thumbnail_url: "https://t/thumb.jpg" } as Post;
        const { container } = render(<PostMedia post={post} isPlaying={false} audioCurrentTime={0} />);
        container.querySelectorAll("img").forEach((img) => expect(img.getAttribute("loading")).toBe("lazy"));
    });
});
