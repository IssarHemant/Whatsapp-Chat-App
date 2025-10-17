import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const currentUser = await User.findById(loggedInUserId);
    const deletedChats = currentUser?.deletedChats || [];

    const users = await User.find({
      _id: { $ne: loggedInUserId, $nin: deletedChats },
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};




export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save(); 

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) { 
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }}

  
  
  
  
  export const deleteChats = async (req, res) => {
    try {
      console.log("req.user:", req.user);
      console.log("req.body:", req.body);
  
      const loggedInUserId = req.user._id;
      const { userIds } = req.body;
  
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "No chat selected for deletion" });
      }
  
      console.log("userIds to delete:", userIds);
  
      const deleteFilters = userIds.flatMap((userId) => [
        { senderId: loggedInUserId, receiverId: userId },
        { senderId: userId, receiverId: loggedInUserId },
      ]);
  
      console.log("deleteFilters:", deleteFilters);
  
      const result = await Message.deleteMany({ $or: deleteFilters });
      console.log("Deleted messages:", result.deletedCount);
  
      await User.findByIdAndUpdate(loggedInUserId, {
        $addToSet: { deletedChats: { $each: userIds } },
      });
  
      res.status(200).json({
        success: true,
        message: "Chats deleted successfully",
        deletedUserIds: userIds,
        deletedMessagesCount: result.deletedCount,
      });
    } catch (error) {
      console.error("❌ Error deleting chats:", error);
      res.status(500).json({ error: error.message });
    }
  };
  