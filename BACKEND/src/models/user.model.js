import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

    email:{
        type:String,
        required:true,
        unique:true
    },

    fullName:{
        type:String,
        required:true,
    },

    password:{
        type:String,
        required:true,
    },

    profilePhoto:{
        type:String,
        default:""
    },
    about: {
        type: String,
        default: "Hey there! I am using WhatsApp."
      },
   
}, {timestamps:true});

const User=mongoose.model("User",userSchema);
export default User;