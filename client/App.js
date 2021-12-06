import React, { Component } from "react";
import {
  ActivityIndicator,
  AppRegistry,
  StyleSheet,
  View,
  Button,
  Alert,
  Dimensions,
  Image,
  TouchableOpacity,
  Text,
  Platform,
  ImageBackground,
} from "react-native";
import DrawCanvas from "./components/DrawCanvas";
import UserCanvas from "./components/UserCanvas";
import { FontAwesome5 } from "@expo/vector-icons";

import Slider from "@react-native-community/slider";
// import Snackbar from 'react-native-snackbar';
import axios from "axios";
import colorMap from "./constants/colorMap.js";
import brushTypes from "./constants/brushTypes.js";
import userBrushes from "./constants/userBrushes.js";
import styleTransferOptions from "./constants/styleTransferOptions.js";
import userBrushesOptions from "./constants/userBrushesOptions.js";
import messageKinds from "./constants/messageKinds.js";
import {
  onOpen,
  onClose,
  onMessage,
  onError,
  sendStroke,
  sendStrokeEnd,
  sendStrokeStart,
} from "./api/websocketApi.js";
import { sendRequest, sendRequestStyle } from "./api/modelApi.js";
import { hello, generateStyle } from "./styles/styles.js";
import Point from "./classes/Point";
import { startClock } from "react-native-reanimated";
import { ScrollView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
// import ColorPicker from './components/Colorpicker';
import ColorPicker from "react-native-wheel-color-picker";
import Spinner from "react-native-loading-spinner-overlay";
import {
  BallIndicator,
  BarIndicator,
  DotIndicator,
  MaterialIndicator,
  PacmanIndicator,
  PulseIndicator,
  SkypeIndicator,
  UIActivityIndicator,
  WaveIndicator,
} from "react-native-indicators";
import { triggerBase64Download } from "react-base64-downloader";
import { ChromePicker } from "react-color";
import { EyeDropper } from "react-eyedrop";
import backendConstants from "./constants/backendUrl";

var device = Dimensions.get("window");
const CANVASWIDTH = device.height * 0.9;
const CANVASHEIGHT = device.height * 0.9;

// Connect to Go backend
// for web
// for android
// let this.state.socket = new WebSocket('ws://10.0.2.2:8080/ws');

// Create dynamic style based on device width/height
// const styles = StyleSheet.create(generateStyle(device));

export default class App extends Component {
  // React state: store the image data
  state = {
    showAICanvas: true,
    showUserCanvas: false,

    AI_CANVASWIDTH: device.height * 0.87,
    AI_CANVASHEIGHT: device.height * 0.87,

    USER_CANVASWIDTH: device.height * 0.87,
    USER_CANVASHEIGHT: device.height * 0.87,
    aiCanvasImageData: "data:image/png;base64,", // image data of the ai canvas

    imageData: "data:image/png;base64,", // raw image data of the segmentation image
    generatedImageData: "data:image/png;base64,", // raw image data of the generated image
    stylizedImageData: "data:image/png;base64,", // raw image data of stylized generated image
    displayedImageData: "data:image/png;base64,", // raw image data of displayed image
    finalImageData: "data:image/png;base64,", // raw image data of generatedImageData + userCanvasImageData
    style: "none", // selected style
    color: "#384f83", // pen color
    userBrushColor: "#00FF00",
    colorPickerDisplay: "#00FF00", // another color state to keep track of the current color picker state

    userBrushBase64: "data:image/png;base64,", // user brush
    userBrushType: userBrushes.PENCIL,
    styleBrushType: "None",
    thickness: 10, // stroke thickness
    ownStroke: [], // client stroke data
    collaboratorStroke: [], // collaborator data
    opacity: 1, // Toggle between the drawing canvas and generated image.
    displayColorPicker: false,
    disableDrawing: false, // used when eyedropper is active
    // 1 = show drawing canvas, 0 = show image
    // socket: new WebSocket('ws://localhost:8080/ws')
    socket:
      Platform.OS === "web"
        ? new WebSocket(`ws://${backendConstants.BACKEND_URL}:8080/ws`)
        : new WebSocket(`ws://${backendConstants.BACKEND_URL}:8080/ws`),
    canvasWidth: CANVASWIDTH,
    canvasHeight: CANVASHEIGHT,
    currentBrush: brushTypes.AI,

    showImageForEyeDropper: false,
    showPreview: true, // show the preview of the other canvas at the top left corner

    isLoading: true, //for loading spinner
    isChangeSize: false, //for slider
  };

  constructor(props) {
    super(props);
    this.sendRequestHelper = this.sendRequestHelper.bind(this);
  }

  // Run when component is first rendered
  componentDidMount() {
    console.log("Attempting connection");

    // Setup this.state.socket handlers
    this.state.socket.onopen = () => {
      console.log(
        "CANVAS DIMS ARE",
        this.state.canvasWidth,
        this.state.canvasHeight
      );

      onOpen(this.state.socket, {
        canvasWidth: this.state.canvasWidth,
        canvasHeight: this.state.canvasHeight,
      });
    };
    this.state.socket.onclose = (event) => {
      onClose(event);
    };
    this.state.socket.onerror = (error) => {
      onError(error);
    };

    this.state.socket.onmessage = (event) => {
      this.onMesageHandler(event);
    };

    this.setState((prevState) => ({
      ...prevState,
      isLoading: false,
    }));
  }

  // Fetch image data from canvas
  // Then call sendRequest to send the data to backend
  grabPixels = async () => {
    this.setState((prevState) => ({
      ...prevState,
      isLoading: true,
    }));
    var getImage = this.refs.drawCanvasRef.getBase64().then((value) => {
      var resultImage = value.split(";base64,")[1];
      console.log("result image is", resultImage);
      this.setState(
        (prevState) => ({
          ...prevState,
          imageData: resultImage,
        }),
        // Do callback to send to server after the imageData is set
        this.sendRequestHelper
      );
    });
  };

  // Send request to model server to generate painting
  sendRequestHelper = async () => {
    this.setState((prevState) => ({
      ...prevState,
      isLoading: true,
    }));

    this.state.socket.send(
      JSON.stringify({
        kind: messageKinds.MESSAGE_GENERATE,
        data: {
          imageData: this.state.imageData,
        },
      })
    );
  };
  // Send a request to the model server to stylize the generated painting
  sendRequestStyleHelper = async (newStyle) => {
    this.setState((prevState) => ({
      ...prevState,
      isLoading: true,
    }));

    this.state.socket.send(
      JSON.stringify({
        kind: messageKinds.MESSAGE_STYLIZE,
        data: {
          imageData: this.state.generatedImageData,
          style: newStyle,
        },
      })
    );
  };

  saveGeneratedImage = () => {
    var getImage = this.refs.userCanvasRef.getBase64().then((value) => {
      var resultImage = value.split(";base64,")[1];
      var foregroundImageDataStripped =
        this.state.displayedImageData.split(";base64,")[1];
      this.setState((prevState) => ({
        ...prevState,
        isLoading: true,
      }));
      this.state.socket.send(
        JSON.stringify({
          kind: messageKinds.MESSAGE_SAVE,
          data: {
            displayedImageData: foregroundImageDataStripped,
            userCanvasImageData: resultImage,
            aiCanvasImageData: this.state.imageData,
          },
        })
      );
    });
  };

  handleThickness = (sliderValue) => {
    this.setState((prevState) => ({
      ...prevState,
      thickness: sliderValue,
      isChangeSize: true,
    }));
    console.log("thickness is now", sliderValue);
  };

  handleThicknessEnd = (sliderValue) => {
    this.setState((prevState) => ({
      ...prevState,
      isChangeSize: false,
    }));
    console.log("thickness is done chaging", sliderValue);
  };


  handleOpacity = (sliderValue) => {
    this.setState((prevState) => ({
      ...prevState,
      opacity: sliderValue,
    }));
    console.log("opacity is now", sliderValue);
  };

  onMesageHandler = (event) => {
    var messages = event.data.split("\n");

    for (var i = 0; i < messages.length; i++) {
      var message = JSON.parse(messages[i]);
      // console.log('Received message is', message);
      this.executeMessage(message);
    }
    // console.log('B stringified is', JSON.stringify(this.canvas.getPaths()));
  };

  // Convert object of rgb {r: g: b:} to hex string
  rgbToHex = (d) => {
    const red = d.r;
    const green = d.g;
    const blue = d.b;
    const rgb = (red << 16) | (green << 8) | (blue << 0);
    return "#" + (0x1000000 + rgb).toString(16).slice(1);
  };

  handleChangeEydropper = ({ rgb, hex }) => {
    console.log("color is", rgb);
    this.setState((prevState) => ({
      ...prevState,
      userBrushColor:
        "#" +
        rgb
          .slice(4, -1)
          .split(",")
          .map((x) => (+x).toString(16).padStart(2, 0))
          .join(""),
    }));
  };

  handleOnPickStart = () => {
    this.setState((prevState) => ({
      ...prevState,
      disableDrawing: true,
      showImageForEyeDropper: true,
      showPreview: false,
    }));

    // Request a full image of the user canvas with generated image
    this.saveGeneratedImage();
    this.disableUserCanvas();
  };

  handleOnPickEnd = () => {
    this.setState((prevState) => ({
      ...prevState,
      disableDrawing: false,
      showImageForEyeDropper: false,
      showPreview: true,
      enableUserCanvas: true
    }));
    this.loadUserCanvas();
  };

  executeMessage = (message) => {
    switch (message.kind) {
      case messageKinds.MESSAGE_STROKE_START:
        // Disabled collab drawing
        // console.log('RECEIVED STROKE STARTT', message);
        // // Append collaborator stroke
        // this.setState(prevState => ({
        //   ...prevState,
        //   collaboratorStroke: [
        //     ...prevState.collaboratorStroke,
        //     new Point(
        //       message.point.x * CANVASWIDTH,
        //       message.point.y * CANVASHEIGHT,
        //       message.thickness,
        //       message.color,
        //       'start',
        //     ),
        //   ],
        // }));

        break;
      case messageKinds.MESSAGE_STROKE:
        // Disabled collab drawing
        // console.log("received collaborator point", message)
        // Append collaborator stroke
        // this.setState(prevState => ({
        //   ...prevState,
        //   collaboratorStroke: [
        //     ...prevState.collaboratorStroke,
        //     new Point(
        //       message.point.x * CANVASWIDTH,
        //       message.point.y * CANVASHEIGHT,
        //       message.thickness,
        //       message.color,
        //       'move',
        //     ),
        //   ],
        // }));
        break;
      case messageKinds.MESSAGE_STROKE_END:
        // Disabled collab drawing
        // this.setState(prevState => ({
        //   ...prevState,
        //   collaboratorStroke: [],
        // }));

        break;
      // User receives a generated image broadcasted from another user
      case messageKinds.MESSAGE_GENERATE:
        console.log("got generate mesage here", message);
        this.setState((prevState) => ({
          ...prevState,
          generatedImageData: message.imageData,
          displayedImageData: message.imageData,
        }));

        this.setState((prevState) => ({
          ...prevState,
          isLoading: false,
        }));

        break;
      // User received a stylized image broadcasted from another user
      case messageKinds.MESSAGE_STYLIZE:
        console.log("image stylize", message);
        this.setState((prevState) => ({
          ...prevState,
          style: message.style,
          stylizedImageData: message.imageData,
          displayedImageData: message.imageData,
        }));

        this.setState((prevState) => ({
          ...prevState,
          isLoading: false,
        }));

        break;

      case messageKinds.MESSAGE_SAVE:
        this.setState((prevState) => ({
          ...prevState,
          isLoading: false,
        }));

        if (this.state.showImageForEyeDropper) {
          this.setState((prevState) => ({
            ...prevState,
            showImageForEyeDropper: true,
            finalImageData: message.savedImageData,
          }));
        }

        // FIXME: Will probably only work on expo web, untested on android/ios
        else if (message.savedImageData != "") {
          triggerBase64Download(message.savedImageData, `Painting`);
        } else {
          alert("Please generate a painting with the AI brush first.");
        }
        break;
    }
  };

  // Enable the AI canvas for drawing
  // Display the
  enableAICanvas = () => {
    if (this.state.showAICanvas) {
      return;
    }

    // Save the drawcanvas and usercanvas data
    var getImageUserCanvas = this.refs.userCanvasRef
      .getBase64()
      .then((usercanvas) => {
        this.setState(
          (prevState) => ({
            ...prevState,
            showAICanvas: true,
            showUserCanvas: false,
            userCanvasImageData: usercanvas,
          }),
          () => {
            for (var i = 0; i < 2; i++) {
              setTimeout(() => {
                this.refs.drawCanvasRef.loadData(this.state.aiCanvasImageData);
              }, 0);
            }
            this.refs.drawCanvasRef.loadData(this.state.aiCanvasImageData);
          }
        );

        // Load the data base64
      });
  };

  loadUserCanvas = () => {
    this.setState(
      (prevState) => ({
        ...prevState,
        showUserCanvas: true
      }), () => {
        for (var i = 0; i < 2; i++) {
          setTimeout(() => {

            if (this.refs.userCanvasRef !== null) {
              this.refs.userCanvasRef.loadData(this.state.userCanvasImageData)

            }
          })
        }
      }


    )

  }

  enableUserCanvas = () => {
    if (this.state.showUserCanvas) {
      return;
    }

    // Save the drawcanvas and usercanvas data
    var getImageAICanvas = this.refs.drawCanvasRef
      .getBase64()
      .then((aicanvas) => {
        this.setState(
          (prevState) => ({
            ...prevState,
            showAICanvas: false,
            showUserCanvas: true,
            aiCanvasImageData: aicanvas,
          }),
          () => {
            for (var i = 0; i < 2; i++) {
              setTimeout(() => {
                this.refs.userCanvasRef.loadData(
                  this.state.userCanvasImageData
                );
              }, 0);
            }
          }
        );
        // Load the data base64
      });
  };

  disableUserCanvas = () => {
    if (this.state.showAICanvas) {
      return;
    }

    // Save the usercanvas data
    var getImageUserCanvas = this.refs.userCanvasRef
      .getBase64()
      .then((usercanvas) => {
        this.setState(
          (prevState) => ({
            ...prevState,
            showAICanvas: false,
            showUserCanvas: false,
            userCanvasImageData: usercanvas,
          })
        );

      });
  };

  enableUserCanvas = () => {
    if (this.state.showUserCanvas) {
      return;
    }

    // Save the drawcanvas and usercanvas data
    var getImageAICanvas = this.refs.drawCanvasRef
      .getBase64()
      .then((aicanvas) => {
        this.setState(
          (prevState) => ({
            ...prevState,
            showAICanvas: false,
            showUserCanvas: true,
            aiCanvasImageData: aicanvas,
          }),
          () => {
            for (var i = 0; i < 2; i++) {
              setTimeout(() => {
                this.refs.userCanvasRef.loadData(
                  this.state.userCanvasImageData
                );
              }, 0);
            }
            // this.refs.userCanvasRef.loadData(this.state.userCanvasImageData);
          }
        );
        // Load the data base64
      });
  };


  render() {
    let brushSlider = (
      <View style={{ flexDirection: "column", padding: 5 }}>
        <View>
          <Text style={{ textAlign: "center", fontSize: 18, padding: 2 }}>
            Size
          </Text>
        </View>


        <Slider
          style={{
            width: 150,
            margin: "auto",
            height: device.height * 0.03,
          }}
          value={this.state.thickness}
          minimumValue={1}
          maximumValue={CANVASWIDTH / 4}
          thumbTintColor="#4f4f4f"
          minimumTrackTintColor="#707070"
          maximumTrackTintColor="#cfcfcf"
          onValueChange={this.handleThickness}
          onSlidingComplete={this.handleThicknessEnd}
        />

      </View>
    );

    // For ipad sizing
    // prevent bouncing / scroll on ios
    document.documentElement.style.height = "100%";
    document.documentElement.style.overflow = "hidden";
    document.body.style.height = "100%";
    document.body.style.overflow = "auto";

    return (
      <View style={styles.container}>
        {/* this View wraps the left column */}
        <View>
          <TouchableOpacity
            onPress={() => {
              this.setState((prevState) => ({
                ...prevState,
                currentBrush: brushTypes.AI,
              }));
              this.enableAICanvas();
            }}
          >
            <Image
              style={[
                styles.brushes,
                {
                  opacity: this.state.currentBrush == brushTypes.AI ? 1 : 0.72,
                },
              ]}
              source={require("./resources/AIBrush.png")}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              this.setState((prevState) => ({
                ...prevState,
                currentBrush: brushTypes.STYLE,
              }));
              this.enableUserCanvas();
            }}
          >
            <Image
              style={[
                styles.brushes,
                {
                  opacity:
                    this.state.currentBrush == brushTypes.STYLE ? 1 : 0.72,
                },
              ]}
              source={require("./resources/styleBrush.png")}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              this.setState((prevState) => ({
                ...prevState,
                currentBrush: brushTypes.USER,
              }));
              // Display user canvas
              this.enableUserCanvas();
            }}
          >
            <Image
              style={[
                styles.brushes,
                {
                  opacity:
                    this.state.currentBrush == brushTypes.USER ? 1 : 0.72,
                },
              ]}
              source={require("./resources/userBrush.png")}
            />
          </TouchableOpacity>
          {this.state.currentBrush == brushTypes.AI && (
            <View>{brushSlider}</View>
          )}
          {this.state.currentBrush == brushTypes.USER && (
            <View>
              <View>
                {/* <Ionicons
            style={{ margin: "auto" }}
            name="eyedrop-outline"
            size={32}
            color={
              "black"
              // this.state.currentBrush == brushTypes.USER
              //   ? this.state.userBrushColor
              //   : this.state.color
            }
          ></Ionicons> */}

                <EyeDropper
                  onPickStart={this.handleOnPickStart}
                  onPickEnd={this.handleOnPickEnd}
                  onChange={this.handleChangeEydropper}
                  wrapperClasses="eyeDroperButton"
                  buttonClasses="eyeDroperButton"
                >
                  Pick Color
                </EyeDropper>
              </View>
              <ChromePicker
                disableAlpha={false}
                style={{ boxShadow: "0px 0px 0px 0px", backgroundColor: this.state.colorPickerDisplay }}
                color={this.state.colorPickerDisplay}
                onChangeComplete={(color) => {
                  this.setState((prevState) => ({
                    ...prevState,
                    userBrushColor: this.rgbToHex(color.rgb),
                    opacity: color.hsl.a,
                    colorPickerDisplay: color.rgb,
                  }));
                }}
              />
              {brushSlider}
            </View>
          )}
        </View>

        {/* this View wraps middle column */}
        <View style={{ flexDirection: "column" }}>
          {/* this View wraps around the buttons that changes canva view & camera*/}
          <View
            style={{
              flexDirection: "row",
              paddingTop: device.height * 0.01,
              alignContent: "flex-end",
              marginLeft: "auto",
            }}
          >
            {/* Download button (commented out)
            <TouchableOpacity
              style={{ margin: 5 }}
              onPress={() => this.saveGeneratedImage()}
            >
              <Image
                style={styles.donwloadButton}
                source={require("./resources/DownloadButton.png")}
              />
            </TouchableOpacity> */}
          </View>

          {/* this View wraps the two canvas */}
          <View style={{ flexDirection: "row" }}>
            {/* Canvas previews */}
            {/* Show the user canvas if we are in the AI canvas main view */}
            {this.state.showAICanvas && this.state.showPreview && (
              <View
                style={[
                  styles.shadowBoxAICanvas,
                  {
                    width: this.state.USER_CANVASHEIGHT / 4,
                    height: this.state.USER_CANVASHEIGHT / 4,
                    marginRight: 5
                  },
                ]}
              >
                <ImageBackground source={this.state.displayedImageData}>
                  <Image
                    style={{
                      width: this.state.USER_CANVASHEIGHT / 4,
                      height: this.state.USER_CANVASHEIGHT / 4,
                    }}
                    source={this.state.userCanvasImageData}
                  />
                </ImageBackground>
              </View>
            )}
            {this.state.showUserCanvas && this.state.showPreview && (
              <View
                style={[
                  styles.shadowBoxAICanvas,
                  {
                    width: this.state.USER_CANVASHEIGHT / 4,
                    height: this.state.USER_CANVASHEIGHT / 4,
                    marginRight: 5

                  },
                ]}
              >
                <Image
                  style={{
                    width: this.state.USER_CANVASHEIGHT / 4,
                    height: this.state.USER_CANVASHEIGHT / 4,
                  }}
                  source={this.state.aiCanvasImageData}
                />
              </View>
            )}

            {/* this wraps the middle big canvas and buttons */}
            <View style={{ flexDirection: "column" }}>
              {/* this View warps AI canvas */}
              {this.state.showAICanvas && (
                <View id="drawGroup" style={styles.drawGroup}>
                  <View
                    style={[
                      styles.shadowBoxAICanvas,
                      {
                        width: this.state.AI_CANVASWIDTH,
                        height: this.state.AI_CANVASHEIGHT,
                      },
                    ]}
                  >
                    <DrawCanvas
                      ref="drawCanvasRef"
                      setClickClear={(click) =>
                        (this.clearChildAIBrush = click)
                      }
                      style={{
                        backgroundColor: "black",
                        position: "absolute",
                        background: "transparent",
                      }}
                      brushType={this.state.currentBrush}
                      thickness={this.state.thickness}
                      color={this.state.color}
                      socket={this.state.socket}
                      otherStrokes={this.state.collaboratorStroke}
                      width={this.state.AI_CANVASWIDTH}
                      height={this.state.AI_CANVASHEIGHT}
                      opacity={1}
                      disable={this.state.disableDrawing}
                    />
                  </View>
                </View>
              )}
              {/* this View wraps generated image & user canvas */}
              {this.state.showUserCanvas && (
                <View id="drawGroup" style={styles.drawGroup}>
                  {/* Displayed image */}
                  <View
                    style={[
                      styles.generatedImageBox,
                      {
                        width: this.state.USER_CANVASWIDTH,
                        height: this.state.USER_CANVASHEIGHT,
                      },
                    ]}
                  >
                    {this.state.displayedImageData != null ? (
                      <Image
                        draggable={false}
                        style={styles.generatedImage}
                        source={{ uri: this.state.displayedImageData }}
                      />
                    ) : null}
                  </View>
                  {/* Main canvas */}
                  {/* Conditionally render the main canvas if toggleDraw == true */}
                  <View
                    style={[
                      styles.shadowBox,
                      {
                        width: this.state.USER_CANVASWIDTH,
                        height: this.state.USER_CANVASHEIGHT,
                      },
                    ]}
                  >
                    {/* USER CANVAS */}
                    <UserCanvas
                      ref="userCanvasRef"
                      setClickClear={(click) =>
                        (this.clearChildUserBrush = click)
                      }
                      style={{
                        position: "absolute",
                        background: "transparent",
                      }}
                      brushType={this.state.currentBrush}
                      userBrushType={this.state.userBrushType}
                      thickness={this.state.thickness}
                      color={this.state.userBrushColor}
                      socket={this.state.socket}
                      otherStrokes={this.state.collaboratorStroke}
                      width={this.state.USER_CANVASWIDTH}
                      height={this.state.USER_CANVASHEIGHT}
                      opacity={this.state.opacity}
                      disable={this.state.disableDrawing}
                      id="myCanvas"
                    />
                  </View>
                </View>
              )}

              {/* Show the image for the eye dropper */}
              {this.state.showImageForEyeDropper && (
                <Image
                  style={{
                    width: this.state.USER_CANVASWIDTH,
                    height: this.state.USER_CANVASHEIGHT,
                  }}
                  source={this.state.finalImageData}
                />
              )}

              {/* this wraps the buttons at the bottom of canvas */}
              {this.state.currentBrush == brushTypes.AI && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                  }}
                >
                  <View style={{ padding: 5, width: "40%" }}>
                    <Button
                      style={{ marginTop: 10, height: "80" }}
                      color="#5e748a"
                      title="clear"
                      onPress={() => this.clearChildAIBrush()}
                    />
                  </View>

                  <View style={{ padding: 5, width: "40%" }}>
                    <Button
                      mode="contained"
                      style={{ padding: 10 }}
                      onPress={this.grabPixels.bind(this)}
                      color="#88508c"
                      title="generate"
                    />
                  </View>
                </View>
              )}
              {this.state.currentBrush == brushTypes.USER && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                  }}
                >

                  <View style={{ padding: 5, width: "40%" }}>
                    <Button
                      color="#717591"
                      title="clear strokes"
                      onPress={() => this.clearChildUserBrush()}
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* this View wraps the right column */}
        <View style={{ flexDirection: "row" }}>
          {/* AI brush palette buttons */}
          {this.state.currentBrush == brushTypes.AI && (
            <View style={styles.brushesContainer}>
              <ScrollView>
                {colorMap.colors.map((obj) => {
                  return (
                    <View style={{ margin: 0 }}>
                      <TouchableOpacity
                        style={{
                          padding: 4,
                          borderTopLeftRadius:
                            this.state.color == obj.color ? 0 : 5,
                          borderBottomLeftRadius:
                            this.state.color == obj.color ? 0 : 5,
                          borderTopRightRadius: 5,
                          borderBottomRightRadius: 5,
                          backgroundColor: obj.color,
                          borderLeftWidth:
                            this.state.color == obj.color ? 10 : 0,
                          borderColor:
                            obj.color == "#efefef" ? "grey" : "#8a8a8a",
                        }}
                        onPress={() => {
                          this.setState({ color: obj.color });
                        }}
                      >
                        <Image
                          draggable={false}
                          style={styles.brushes}
                          source={obj.logo}
                        />
                        <Text
                          style={{
                            color: obj.color == "#efefef" ? "#3d3d3d" : "white",
                            fontSize: device.height * 0.025,
                          }}
                        >
                          {obj.label}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Render the slider and the brush legend */}
            </View>
          )}

          {/* Style buttons */}
          {this.state.currentBrush == brushTypes.STYLE && (
            <View style={styles.brushesContainer}>
              {/* None style button */}
              <ScrollView>
                <View style={{ margin: 2 }}>
                  <TouchableOpacity
                    style={[
                      styles.functionButton,
                      {
                        backgroundColor:
                          this.state.styleBrushType == "None"
                            ? "#3d3d3d"
                            : "grey",
                      },
                    ]}
                    onPress={() => {
                      this.setState((prevState) => ({
                        ...prevState,
                        displayedImageData: this.state.generatedImageData,
                        styleBrushType: "None",
                      }));
                    }}
                  >
                    <Image
                      style={styles.brushes}
                      source={require("./resources/none_style.png")}
                    />
                    <Text style={{ color: "white", fontSize: 20 }}> None </Text>
                  </TouchableOpacity>
                </View>
                {/* Programmatically render all style options */}
                {styleTransferOptions.styles.map((obj) => {
                  return (
                    <View style={{ margin: 2 }}>
                      <TouchableOpacity
                        style={[
                          styles.functionButton,
                          {
                            backgroundColor:
                              this.state.styleBrushType == obj.name
                                ? "#3d3d3d"
                                : "grey",
                          },
                        ]}
                        onPress={() => {
                          this.sendRequestStyleHelper(obj.name);
                          this.setState((prevState) => ({
                            styleBrushType: obj.name,
                          }));
                        }}
                      >
                        <Image style={styles.brushes} source={obj.image_url} />
                        <Text
                          style={{
                            color: "white",
                            fontSize: device.height * 0.024,
                          }}
                        >
                          {obj.label}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* User Brush buttons */}
        {this.state.currentBrush == brushTypes.USER && (
          <View style={styles.brushesContainer}>
            {/* <View style={{ height: device.height * 0.4 }}> */}
            <ScrollView>
              {/* Programmatically render all options */}
              {userBrushesOptions.userBrushes.map((obj) => {
                return (
                  <View style={{ margin: 2 }}>
                    <TouchableOpacity
                      style={[
                        styles.functionButton,
                        {
                          backgroundColor:
                            this.state.userBrushType == obj.name
                              ? "#dbdbdb"
                              : "white",
                        },
                      ]}
                      onPress={() => {
                        this.setState((prevState) => ({
                          ...prevState,
                          userBrushType: obj.name,
                        }));
                      }}
                    >
                      <Image
                        style={styles.userBrushes}
                        source={obj.image_url}
                      />
                      <Text
                        style={{
                          color:
                            this.state.userBrushType == obj.name
                              ? "black"
                              : "#2e2e2e",
                          fontSize: device.height * 0.024,
                        }}
                      >
                        {obj.label}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            {/* </View> */}
          </View>
        )}

        {/* this View wraps the spinner */}
        {/* Spinner is recommended to be at the root level */}
        <View style={styles.spinnerContainer}>
          <ActivityIndicator
            animating={this.state.isLoading}
            size={"large"}
            color={"#545454"}
            style={{ transform: [{ scale: 3 }] }}
          />
        </View>


        {this.state.isChangeSize == true && (
          <View style={styles.circleContainer}>
            <Text style={{color:"#4d4d4d",}}>
              Size Preview:
            </Text>
            <Ionicons
              style={{justifyContent: "center", alignItems: "center", margin: "auto", }}
              name="ellipse"
              color={
                this.state.currentBrush == brushTypes.USER
                  ? this.state.userBrushColor
                  : this.state.color
              }
              size={this.state.thickness * 1.2}
            ></Ionicons>
          </View>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "white",
  },
  generatedImageBox: {
    userDrag: "none",
    userSelect: "none",
    backgroundColor: "transparent",
    position: "absolute",
  },
  generatedImage: {
    width: "100%",
    height: "100%",
    userDrag: "none",
    userSelect: "none",
  },
  shadowBoxAICanvas: {
    shadowColor: "grey",
    shadowRadius: 20,
    position: "relative",
  },
  shadowBox: {
    shadowColor: "grey",
    shadowRadius: 20,
    position: "relative",
  },
  functionButton: {
    padding: 4,
    borderRadius: 5,
  },

  drawGroup: {
    flexDirection: "row",
    // alignItems: "center",
    // justifyContent: "center",
  },
  strokeGroup: {
    flexDirection: "column",
    alignItems: "center",
  },
  toolGroup: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  brushes: {
    margin: 0,
    height: device.height * 0.110,
    width: device.height * 0.110 * 1.8,
    padding: 0,
    userDrag: "none",
    userSelect: "none",
  },
  donwloadButton: {
    margin: 0,
    height: device.height * 0.145 * 0.4,
    width: device.height * 0.145 * 0.41,
    padding: 0,
    userDrag: "none",
    userSelect: "none",
  },
  brushesContainer: {
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
    height: device.height,
    borderLeftColor: "#C8C8C8",
    backgroundColor: "#f2f2eb",
    borderLeftWidth: 3,
  },
  userBrushes: {
    justifyContent: "start",
    margin: 0,
    height: device.height * 0.110,
    width: device.height * 0.110 * 1.8,
    paddingTop: 0,
  },
  spinnerTextStyle: {
    color: "transparent",
  },
  spinnerContainer: {
    position: "absolute",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    left: device.width / 2,
    top: device.height / 2.5,
  },
  circleContainer: {
    height: device.height * 0.35, 
    width: device.height * 0.3, 
    marginBottom: "0.5em",
    position: "absolute",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(245, 245, 237, 0.8)",
    borderRadius: 10,
    left: device.width / 2,
    top: device.height / 3,
  },

  swatch: {
    padding: "5px",
    background: "#fff",
    borderRadius: "1px",
    boxShadow: "0 0 0 1px rgba(0,0,0,.1)",
    display: "inline-block",
    cursor: "pointer",
  },
  popover: {
    position: "absolute",
    zIndex: "2",
  },
  cover: {
    position: "fixed",
    top: "0px",
    right: "0px",
    bottom: "0px",
    left: "0px",
  },
  color: {
    width: "36px",
    height: "14px",
    borderRadius: "2px",
  },
  eyeDroperButton: {
    color: "pink",
    backgroundColor: "pink",
  },
});
