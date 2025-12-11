#include <stdint.h>
#include <string.h>

#define hashsize(n) ((size_t)1 << (n))
#define hashmask(n) (hashsize(n) - 1)

static inline uint32_t rot(uint32_t x, uint32_t k) {
    return (x << k) | (x >> (32 - k));
}

#define MIX(a,b,c) do { \
    a -= c;  a ^= rot(c, 4);  c += b; \
    b -= a;  b ^= rot(a, 6);  a += c; \
    c -= b;  c ^= rot(b, 8);  b += a; \
    a -= c;  a ^= rot(c,16);  c += b; \
    b -= a;  b ^= rot(a,19);  a += c; \
    c -= b;  c ^= rot(b, 4);  b += a; \
} while (0)

#define FINAL(a,b,c) do { \
    c ^= b; c -= rot(b,14); \
    a ^= c; a -= rot(c,11); \
    b ^= a; b -= rot(a,25); \
    c ^= b; c -= rot(b,16); \
    a ^= c; a -= rot(c, 4); \
    b ^= a; b -= rot(a,14); \
    c ^= b; c -= rot(b,24); \
} while (0)

/* ASan-safe Jenkins hashlittle: never reads past 'length' bytes */
static uint32_t hashlittle(const void *key, size_t length, uint32_t initval)
{
    const uint8_t *p = (const uint8_t *)key;
    uint32_t a, b, c;

    a = b = 0x9e3779b9;          /* the golden ratio; an arbitrary value */
    c = initval;

    /* Handle most of the key in 12-byte chunks */
    while (length >= 12) {
        uint32_t x;
        /* use memcpy so the compiler won’t issue over-reads or require alignment */
        memcpy(&x, p + 0, 4);  a += x;
        memcpy(&x, p + 4, 4);  b += x;
        memcpy(&x, p + 8, 4);  c += x;

        MIX(a, b, c);
        p      += 12;
        length -= 12;
    }

    /* Handle the last 0..11 bytes */
    switch (length) {
    case 11: c += (uint32_t)p[10] << 16; /* fallthrough */
    case 10: c += (uint32_t)p[9]  << 8;  /* fallthrough */
    case 9:  c += (uint32_t)p[8];        /* fallthrough */
    case 8:  b += (uint32_t)p[7]  << 24; /* fallthrough */
    case 7:  b += (uint32_t)p[6]  << 16; /* fallthrough */
    case 6:  b += (uint32_t)p[5]  << 8;  /* fallthrough */
    case 5:  b += (uint32_t)p[4];        /* fallthrough */
    case 4:  a += (uint32_t)p[3]  << 24; /* fallthrough */
    case 3:  a += (uint32_t)p[2]  << 16; /* fallthrough */
    case 2:  a += (uint32_t)p[1]  << 8;  /* fallthrough */
    case 1:  a += (uint32_t)p[0];        /* fallthrough */
             break;
    case 0:  /* nothing left */ break;
    }

    FINAL(a, b, c);
    return c;
}
