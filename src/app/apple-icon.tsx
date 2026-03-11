import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                }}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 512 512"
                    width="160"
                    height="160"
                    fill="none"
                >
                    {/* Back profile: solid white silhouette */}
                    <path
                        d="
              M 196 192
              C 196 140, 218 100, 250 84
              C 264 76, 276 74, 290 80
              C 314 90, 330 114, 332 146
              C 334 168, 326 192, 314 210
              C 304 226, 290 238, 278 254
              C 268 268, 264 284, 266 302
              C 268 316, 276 328, 288 336
              C 306 348, 328 356, 350 368
              C 374 380, 394 396, 406 420
              C 414 438, 418 456, 418 476
              L 94 476
              C 94 456, 98 438, 106 420
              C 118 396, 138 380, 162 368
              C 184 356, 206 348, 224 336
              C 236 328, 244 316, 246 302
              C 248 284, 244 268, 234 254
              C 222 238, 208 226, 198 210
              C 186 192, 178 168, 180 146
              C 182 114, 198 90, 222 80
              C 236 74, 248 76, 262 84
              C 218 100, 196 140, 196 192
              Z
            "
                        fill="#FFFFFF"
                    />
                    {/* Front profile: outline only, shifted right */}
                    <path
                        d="
              M 256 172
              C 256 120, 278 80, 310 64
              C 324 56, 336 54, 350 60
              C 374 70, 390 94, 392 126
              C 394 148, 386 172, 374 190
              C 364 206, 350 218, 338 234
              C 328 248, 324 264, 326 282
              C 328 296, 336 308, 348 316
              C 366 328, 388 336, 410 348
              C 434 360, 454 376, 466 400
              C 474 418, 478 436, 478 456
              L 154 456
              C 154 436, 158 418, 166 400
              C 178 376, 198 360, 222 348
              C 244 336, 266 328, 284 316
              C 296 308, 304 296, 306 282
              C 308 264, 304 248, 294 234
              C 282 218, 268 206, 258 190
              C 246 172, 238 148, 240 126
              C 242 94, 258 70, 282 60
              C 296 54, 308 56, 322 64
              C 278 80, 256 120, 256 172
              Z
            "
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth={7}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        ),
        {
            ...size,
        }
    );
}
