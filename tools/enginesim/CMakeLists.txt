# Headless Engine Simulator recorder (see prepare.mjs): the simulation, the script compiler and
# piranha, built without the delta-studio renderer, SDL or Boost.
cmake_minimum_required(VERSION 3.16)
project(esim_headless CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(ROOT ${CMAKE_CURRENT_SOURCE_DIR}/..)
set(SUB ${ROOT}/dependencies/submodules)
set(GEN ${CMAKE_CURRENT_BINARY_DIR}/gen)
file(MAKE_DIRECTORY ${GEN})

if (NOT FLEX_EXE OR NOT BISON_EXE)
    message(FATAL_ERROR "pass -DFLEX_EXE=<win_flex.exe> -DBISON_EXE=<win_bison.exe>")
endif ()

# piranha's grammar
add_custom_command(
    OUTPUT ${GEN}/parser.auto.cpp ${GEN}/parser.auto.h
    COMMAND ${BISON_EXE} --defines=${GEN}/parser.auto.h -o ${GEN}/parser.auto.cpp ${SUB}/piranha/flex-bison/specification.y
    DEPENDS ${SUB}/piranha/flex-bison/specification.y
    VERBATIM)
add_custom_command(
    OUTPUT ${GEN}/scanner.auto.cpp ${GEN}/scanner.auto.h
    COMMAND ${FLEX_EXE} --wincompat --header-file=${GEN}/scanner.auto.h -o ${GEN}/scanner.auto.cpp ${SUB}/piranha/flex-bison/scanner.l
    DEPENDS ${SUB}/piranha/flex-bison/scanner.l ${GEN}/parser.auto.h
    VERBATIM)

file(GLOB SCS_SOURCES ${SUB}/simple-2d-constraint-solver/src/*.cpp)
file(GLOB PIRANHA_SOURCES ${SUB}/piranha/src/*.cpp)

set(ESIM_NAMES
    audio_buffer camshaft crankshaft combustion_chamber connecting_rod convolution_filter
    cylinder_bank cylinder_head delay_filter derivative_filter direct_throttle_linkage dynamometer
    engine exhaust_system feedback_comb_filter filter fuel function gas_system gaussian_filter
    governor ignition_module impulse_response intake jitter_filter leveling_filter low_pass_filter
    part piston piston_engine_simulator simulator standard_valvetrain starter_motor synthesizer
    throttle transmission utilities valvetrain vehicle vehicle_drag_constraint vtec_valvetrain)
set(ESIM_SOURCES)
foreach (n ${ESIM_NAMES})
    list(APPEND ESIM_SOURCES ${ROOT}/src/${n}.cpp)
endforeach ()

set(SCRIPT_SOURCES
    ${ROOT}/scripting/src/channel_types.cpp
    ${ROOT}/scripting/src/compiler.cpp
    ${ROOT}/scripting/src/engine_context.cpp
    ${ROOT}/scripting/src/language_rules.cpp)

add_library(scs STATIC ${SCS_SOURCES})
target_include_directories(scs PUBLIC ${SUB}/simple-2d-constraint-solver/include)

add_library(piranha STATIC ${PIRANHA_SOURCES} ${GEN}/parser.auto.cpp ${GEN}/scanner.auto.cpp)
target_include_directories(piranha PUBLIC ${GEN} ${SUB}/piranha/include ${SUB}/piranha/dependencies/libraries/flex/include)

add_library(esim STATIC ${ESIM_SOURCES} ${SCRIPT_SOURCES})
target_include_directories(esim PUBLIC ${SUB} ${ROOT}/include)
target_link_libraries(esim PUBLIC scs piranha)

add_executable(esim_render esim_render.cpp)
target_link_libraries(esim_render esim)

if (MSVC)
    foreach (t scs piranha esim esim_render)
        target_compile_options(${t} PRIVATE /W0 /O2 /utf-8 /EHsc)
        target_compile_definitions(${t} PRIVATE _CRT_SECURE_NO_WARNINGS NOMINMAX)
    endforeach ()
endif ()
