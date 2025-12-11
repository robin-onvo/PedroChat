# Variables
CC=gcc
OPTIMIZE=-ffunction-sections -fdata-sections -O2 -flto -Wno-unused-result -fno-strict-aliasing
DEBUG_FLAGS=-g -O0 -Wfatal-errors -Werror -DWALLOCATOR_DEBUG -DWALLOCATOR_DEBUG_BORDERCHECK
LIBS=-luuid -lcurl -pthread -lm -lbsd
INCLUDES = 

#   -DWALLOCATOR_DEBUG -DWALLOCATOR_DEBUG_BORDERCHECK
# -fsanitize=address -fno-omit-frame-pointer

# Build mode: release (default) or debug
MODE ?= release

# Base warnings/defs
CFLAGS_BASE=-Wall -Wno-psabi -Wfatal-errors -Werror -DMBEDTLS_CONFIG_FILE='"mbedtls_config.h"'

# Select flags per mode (OPTIMIZE goes into CFLAGS in release; LTO linked only in release)
ifeq ($(MODE),debug)
  CFLAGS=$(CFLAGS_BASE) $(DEBUG_FLAGS)
  LDFLAGS= -flto -fsanitize=address -fno-omit-frame-pointer
else
  CFLAGS=$(CFLAGS_BASE) #$(OPTIMIZE)
  LDFLAGS= -flto -Wl,--gc-sections -fsanitize=address -fno-omit-frame-pointer -fsanitize=undefined
endif

# Directories
SRC_DIR=.
BUILD_DIR=build

# Find all .c files (following symlinks)
SOURCES=$(shell find -L $(SRC_DIR) -type f -name '*.c')
# Place all .o files in BUILD_DIR
OBJECTS=$(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.o,$(SOURCES))

# Name of the final executable
EXECUTABLE=example

# Default target builds all
all: $(EXECUTABLE)
	@echo "Build complete ($(MODE))."

# Debug target: rebuild in debug mode and launch gdb
debug:
	@echo "Building with debugging flags..."
	@$(MAKE) MODE=debug --no-print-directory clean $(EXECUTABLE)
	@-rm -f WADEBUG.txt
	@echo "Launching debugger..."
	gdb $(EXECUTABLE) -ex run
	node memcheck.js

# Link object files into a final executable
$(EXECUTABLE): $(OBJECTS)
	@echo "Linking $(EXECUTABLE)..."
	@$(CC) $(LDFLAGS) $(OBJECTS) -o $@ $(LIBS)

# Compile each .c to an .o, ensuring directories exist
$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c
	@echo "Compiling $<..."
	@mkdir -p $(dir $@)
	@$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

# Specific file compilation
FILE=
compile:
	@echo "Compiling $(FILE)..."
	@mkdir -p $(BUILD_DIR)/$(dir $(FILE))
	$(CC) $(CFLAGS) $(INCLUDES) -c $(FILE) -o $(BUILD_DIR)/$(FILE:.c=.o)

# Clean target to remove compiled files
clean:
	@echo "Cleaning up..."
	@rm -rf $(BUILD_DIR) $(EXECUTABLE)

.PHONY: all clean compile debug
